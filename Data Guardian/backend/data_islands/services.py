"""
Data Islands services.

Orchestrates per-table VIEW creation, refresh, scheduling, and deletion
against the host database.

Public API:
  create_island(...)         — slugify name, persist metadata, execute DDL per table
  refresh_island(...)        — re-run CREATE OR REPLACE VIEW for all island tables
  delete_island_view(...)    — DROP all VIEWs + delete metadata record
  schedule_next_run(island)  — compute and store next_run_at from schedule config
  get_pii_columns_for_table  — query catalogue for PII column metadata
  build_table_sql(...)       — generate SELECT SQL with PII policy + incremental filter
"""

import json
import re
import logging

from django.utils import timezone

from datasources.models import DataSource
from datasources.connectors import get_connector
from .models import DataIsland, DataIslandTable

logger = logging.getLogger(__name__)


# ── Name slugification ────────────────────────────────────────────────────────

def _slugify_view_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug[:50] or "island"


def _slugify_table(table_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", table_name.lower()).strip("_")
    return slug[:40] or "table"


def _island_schema_name(island_slug: str) -> str:
    """Returns the per-island schema name: di_{island_slug}."""
    return f"di_{island_slug}"


def _build_view_name(island_slug: str, table_slug: str) -> str:
    """Fully qualified view name: di_{island_slug}.{table_slug}."""
    return f"{_island_schema_name(island_slug)}.{table_slug}"


# ── Schema isolation ──────────────────────────────────────────────────────────

def _ensure_island_schema(connector, db_type: str, island_slug: str) -> bool:
    """
    Create a dedicated per-island schema if it doesn't exist.

    PostgreSQL: CREATE SCHEMA IF NOT EXISTS di_{island_slug}
    MySQL:      CREATE DATABASE IF NOT EXISTS di_{island_slug}

    Returns True if schema exists/was created, False on failure.
    Failures are logged as warnings and never propagate.
    """
    schema = _island_schema_name(island_slug)
    if db_type == "postgresql":
        ddl = f"CREATE SCHEMA IF NOT EXISTS {schema}"
    else:
        ddl = f"CREATE DATABASE IF NOT EXISTS {schema}"
    try:
        connector.execute_ddl(ddl)
        logger.info("Ensured island schema '%s' exists", schema)
        return True
    except Exception as exc:
        logger.warning(
            "Could not create island schema '%s': %s — "
            "ensure the database user has CREATE DATABASE privilege.",
            schema, exc,
        )
        return False


def _drop_island_schema(connector, db_type: str, island_slug: str) -> None:
    """
    Drop the entire per-island schema and all its views in one statement.

    PostgreSQL: DROP SCHEMA IF EXISTS di_{island_slug} CASCADE
    MySQL:      DROP DATABASE IF EXISTS di_{island_slug}
    """
    schema = _island_schema_name(island_slug)
    if db_type == "postgresql":
        ddl = f"DROP SCHEMA IF EXISTS {schema} CASCADE"
    else:
        ddl = f"DROP DATABASE IF EXISTS {schema}"
    try:
        connector.execute_ddl(ddl)
        logger.info("Dropped island schema '%s'", schema)
    except Exception as exc:
        logger.warning("DROP schema '%s' failed (proceeding): %s", schema, exc)


# ── SQL generation helpers ────────────────────────────────────────────────────

def _get_refresh_time_expr(db_type: str) -> str:
    if db_type == "postgresql":
        return "EXTRACT(EPOCH FROM NOW())::bigint AS query_refresh_time"
    return "UNIX_TIMESTAMP() AS query_refresh_time"


def _get_incremental_filter(db_type: str, time_column: str, last_unix: int) -> str:
    if db_type == "postgresql":
        return f"WHERE EXTRACT(EPOCH FROM {time_column})::bigint > {last_unix}"
    return f"WHERE UNIX_TIMESTAMP({time_column}) > {last_unix}"


def build_table_sql(
    table_name: str,
    columns: list,
    pii_policy: str,
    refresh_strategy: str,
    time_column: str,
    last_refresh_unix: int,
    db_type: str,
    source_db: str = "",
) -> str:
    """
    Generate the SELECT body for one table's VIEW.

    Args:
        table_name:        Source table in the host DB.
        columns:           List of {name, effective_pii_likelihood} from catalogue.
                           Empty list → no catalogue available, fall back to SELECT *.
        pii_policy:        "allow" | "hide" | "encrypt"
        refresh_strategy:  "full" | "incremental"
        time_column:       Column name for incremental WHERE clause (ignored if full).
        last_refresh_unix: Unix timestamp of last refresh; 0 on first create.
        db_type:           "mysql" | "postgresql" (affects SQL dialect).
        source_db:         For MySQL: original database name used to fully qualify
                           the FROM clause so cross-database VIEWs resolve correctly.
                           PostgreSQL resolves table OIDs at VIEW creation time so
                           qualification is not required there.

    Returns:
        Full SELECT statement (without CREATE OR REPLACE VIEW prefix).
    """
    refresh_time_expr = _get_refresh_time_expr(db_type)
    # MySQL stores VIEW queries as text and resolves unqualified names against the
    # VIEW's own database, not the connection database. When VIEWs live in di_{slug}
    # but source tables live in the original DB, we MUST qualify the FROM clause.
    qualified_table = f"{source_db}.{table_name}" if source_db and db_type == "mysql" else table_name

    if not columns:
        # No catalogue — fall back to SELECT * plus refresh time column
        sql = f"SELECT\n  *,\n  {refresh_time_expr}\nFROM {qualified_table}"
    else:
        col_exprs = []
        for col in columns:
            col_name = col["name"]
            pii_level = col.get("effective_pii_likelihood", "none")
            is_pii = pii_level in ("medium", "high")

            if is_pii and pii_policy == "hide":
                continue  # exclude column
            elif is_pii and pii_policy == "encrypt":
                if db_type == "postgresql":
                    col_exprs.append(f"MD5({col_name}::text) AS {col_name}")
                else:
                    col_exprs.append(f"MD5(CAST({col_name} AS CHAR)) AS {col_name}")
            else:
                col_exprs.append(col_name)

        col_exprs.append(refresh_time_expr)
        sql = "SELECT\n  " + ",\n  ".join(col_exprs) + f"\nFROM {qualified_table}"

    if refresh_strategy == "incremental" and time_column:
        sql += "\n" + _get_incremental_filter(db_type, time_column, last_refresh_unix)

    return sql


def build_ddl(view_name: str, sql_query: str) -> str:
    return f"CREATE OR REPLACE VIEW {view_name} AS {sql_query}"


# ── PII catalogue lookup ──────────────────────────────────────────────────────

def get_pii_columns_for_table(datasource_id: str, table_name: str) -> list:
    """
    Return column PII metadata from the latest completed catalogue run.
    Returns [] if no catalogue exists (caller uses SELECT * fallback).
    """
    try:
        from catalogue.models import CatalogueRun, TableCatalogue
        run = (
            CatalogueRun.objects
            .filter(datasource_id=datasource_id, status="completed")
            .order_by("-created_at")
            .first()
        )
        if not run:
            return []
        table = TableCatalogue.objects.filter(run=run, table_name=table_name).first()
        if not table:
            return []
        return [
            {"name": c.column_name, "effective_pii_likelihood": c.effective_pii_likelihood}
            for c in table.columns.all()
        ]
    except Exception as exc:
        logger.warning("get_pii_columns_for_table failed for %s/%s: %s", datasource_id, table_name, exc)
        return []


# ── Scheduling ────────────────────────────────────────────────────────────────

def schedule_next_run(island: DataIsland) -> None:
    """Compute next_run_at from the island's schedule config and save it."""
    from core.scheduling import compute_next_run

    next_run = compute_next_run(island.schedule_type, island.schedule_value)
    if next_run is None:
        return
    island.next_run_at = next_run
    island.save(update_fields=["next_run_at", "updated_at"])


# ── Core service functions ────────────────────────────────────────────────────

def create_island(
    datasource_id: str,
    name: str,
    description: str = "",
    refresh_type: str = "static",
    schedule_type: str = "cron",
    schedule_value: str = "",
    pii_policy: str = "allow",
    refresh_strategy: str = "full",
    table_configs: list | None = None,
) -> DataIsland:
    """
    Create a new DataIsland: persist metadata and materialize one VIEW per table.

    table_configs: list of dicts with keys:
        table_name (str), time_column (str), columns (list[{name, effective_pii_likelihood}])

    On success: island status = "active"
    On partial failure: island status = "error", per-table errors stored in DataIslandTable.last_error
    """
    ds = DataSource.objects.get(pk=datasource_id)
    island_slug = _slugify_view_name(name)

    island = DataIsland.objects.create(
        name=name,
        description=description,
        datasource=ds,
        refresh_type=refresh_type,
        schedule_type=schedule_type,
        schedule_value=schedule_value,
        pii_policy=pii_policy,
        refresh_strategy=refresh_strategy,
        status="draft",
    )

    if refresh_type == "scheduled" and schedule_value:
        schedule_next_run(island)

    if not table_configs:
        island.status = "error"
        island.last_error = "No tables selected."
        island.save(update_fields=["status", "last_error", "updated_at"])
        raise RuntimeError("No tables selected.")

    creds = ds.get_credentials()
    connector = get_connector(ds.db_type, creds)
    source_db = creds.get("database", "") if ds.db_type == "mysql" else ""
    schema_created = _ensure_island_schema(connector, ds.db_type, island_slug)
    now = timezone.now()
    errors = []

    for tc in table_configs:
        table_name = tc["table_name"]
        time_column = tc.get("time_column", "")
        columns = tc.get("columns", [])

        table_slug = _slugify_table(table_name)
        view_name = _build_view_name(island_slug, table_slug)

        sql = build_table_sql(
            table_name=table_name,
            columns=columns,
            pii_policy=pii_policy,
            refresh_strategy=refresh_strategy,
            time_column=time_column,
            last_refresh_unix=0,
            db_type=ds.db_type,
            source_db=source_db,
        )

        island_table = DataIslandTable.objects.create(
            island=island,
            table_name=table_name,
            view_name=view_name,
            sql_query=sql,
            time_column=time_column,
            status="draft",
        )

        ddl = build_ddl(view_name, sql)
        logger.info("[DataIsland:%s] Creating VIEW '%s'", island.id, view_name)

        try:
            connector.execute_ddl(ddl)
            island_table.status = "active"
            island_table.last_error = ""
            island_table.last_refreshed_at = now
            island_table.save(update_fields=["status", "last_error", "last_refreshed_at", "updated_at"])
            logger.info("[DataIsland:%s] VIEW '%s' created", island.id, view_name)
        except Exception as exc:
            err_msg = str(exc)
            island_table.status = "error"
            island_table.last_error = err_msg
            island_table.save(update_fields=["status", "last_error", "updated_at"])
            errors.append(f"{table_name}: {err_msg}")
            logger.error("[DataIsland:%s] VIEW '%s' failed: %s", island.id, view_name, exc)

    if errors:
        island.status = "error"
        island.last_error = "\n".join(errors)
    else:
        island.status = "active"
        island.last_error = ""
        island.last_refreshed_at = now

    island.save(update_fields=["status", "last_error", "last_refreshed_at", "updated_at"])
    return island


def refresh_island(island_id: str) -> DataIsland:
    """
    Re-materialize all VIEWs for an existing DataIsland.

    Falls back to legacy single-view path for Phase 1 islands (no island_tables).
    After a successful scheduled refresh, advances next_run_at.
    """
    island = DataIsland.objects.select_related("datasource").get(pk=island_id)
    ds = island.datasource

    # ── Legacy fallback (Phase 1 islands with no DataIslandTable records) ──
    if not island.island_tables.exists():
        logger.info("[DataIsland:%s] Legacy refresh path (single view)", island.id)
        ddl = build_ddl(island.view_name, island.sql_query)
        try:
            connector = get_connector(ds.db_type, ds.get_credentials())
            connector.execute_ddl(ddl)
        except Exception as exc:
            island.status = "error"
            island.last_error = str(exc)
            island.save(update_fields=["status", "last_error", "updated_at"])
            raise RuntimeError(str(exc)) from exc

        island.status = "active"
        island.last_error = ""
        island.last_refreshed_at = timezone.now()
        island.save(update_fields=["status", "last_error", "last_refreshed_at", "updated_at"])
        return island

    # ── Phase 2 path — refresh per-table VIEWs ──
    creds = ds.get_credentials()
    connector = get_connector(ds.db_type, creds)
    source_db = creds.get("database", "") if ds.db_type == "mysql" else ""
    island_slug = _slugify_view_name(island.name)
    _ensure_island_schema(connector, ds.db_type, island_slug)
    now = timezone.now()

    last_refresh_unix = 0
    if island.last_refreshed_at:
        last_refresh_unix = int(island.last_refreshed_at.timestamp())

    errors = []
    for island_table in island.island_tables.all():
        # Regenerate SQL (incremental WHERE uses updated last_refresh_unix)
        columns = get_pii_columns_for_table(str(ds.id), island_table.table_name)
        sql = build_table_sql(
            table_name=island_table.table_name,
            columns=columns,
            pii_policy=island.pii_policy,
            refresh_strategy=island.refresh_strategy,
            time_column=island_table.time_column,
            last_refresh_unix=last_refresh_unix,
            db_type=ds.db_type,
            source_db=source_db,
        )
        island_table.sql_query = sql
        ddl = build_ddl(island_table.view_name, sql)

        logger.info("[DataIsland:%s] Refreshing VIEW '%s'", island.id, island_table.view_name)
        try:
            connector.execute_ddl(ddl)
            island_table.status = "active"
            island_table.last_error = ""
            island_table.last_refreshed_at = now
            island_table.save(update_fields=["sql_query", "status", "last_error", "last_refreshed_at", "updated_at"])
        except Exception as exc:
            err_msg = str(exc)
            island_table.status = "error"
            island_table.last_error = err_msg
            island_table.save(update_fields=["sql_query", "status", "last_error", "updated_at"])
            errors.append(f"{island_table.table_name}: {err_msg}")
            logger.error("[DataIsland:%s] Refresh failed for '%s': %s", island.id, island_table.view_name, exc)

    if errors:
        island.status = "error"
        island.last_error = "\n".join(errors)
    else:
        island.status = "active"
        island.last_error = ""
        island.last_refreshed_at = now

    island.save(update_fields=["status", "last_error", "last_refreshed_at", "updated_at"])

    if island.refresh_type == "scheduled" and island.schedule_value:
        schedule_next_run(island)

    return island


def delete_island_view(island_id: str) -> None:
    """
    Drop the island's dedicated schema (and all its VIEWs) then delete the metadata record.

    Phase 2: drops the entire di_{island_slug} schema with CASCADE — one statement.
    Phase 1 legacy: falls back to dropping individual views by name.
    Metadata is ALWAYS deleted even if DDL fails (prevents orphaned records).
    """
    island = DataIsland.objects.select_related("datasource").get(pk=island_id)
    ds = island.datasource

    try:
        connector = get_connector(ds.db_type, ds.get_credentials())
    except Exception as exc:
        logger.warning("[DataIsland:%s] Could not get connector for DROP: %s", island.id, exc)
        connector = None

    if connector:
        if island.island_tables.exists():
            # Phase 2 — drop the entire per-island schema
            island_slug = _slugify_view_name(island.name)
            _drop_island_schema(connector, ds.db_type, island_slug)
        elif island.view_name:
            # Phase 1 legacy — drop single view by name
            try:
                connector.execute_ddl(f"DROP VIEW IF EXISTS {island.view_name}")
            except Exception as exc:
                logger.warning("[DataIsland:%s] Legacy DROP VIEW failed (proceeding): %s", island.id, exc)

    island.delete()
    logger.info("[DataIsland:%s] Metadata deleted", island_id)
