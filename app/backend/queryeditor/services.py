"""
Query Editor services — read-only guard + query/preview execution.

The editor is deliberately SELECT-only: it is a data-exploration surface, not a
migration tool. `assert_read_only` rejects anything that could mutate the
database or run more than one statement. Execution goes through the existing
per-vendor connector (`datasources.connectors`), so it inherits the same DSN
handling, credential decryption and connection lifecycle as the rest of DGP.
"""

from __future__ import annotations

import csv
import io
import logging
import re
import time

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.utils import timezone

from core.scheduling import compute_next_run
from datasources.connectors import get_connector

logger = logging.getLogger(__name__)

# Hard caps so a careless `SELECT *` on a billion-row table can't take the
# backend down. Run results are wrapped in a bounded subquery; previews use a
# straight LIMIT.
MAX_RESULT_ROWS = 1000
MAX_PREVIEW_ROWS = 500
DEFAULT_PREVIEW_ROWS = 100

# Statement must begin with one of these (after comments are stripped).
_ALLOWED_PREFIXES = ("select", "with", "explain", "show", "pragma", "table", "values")

# Any of these appearing as a bare word aborts the query. Deliberately omits
# words that double as common read-side functions/clauses (e.g. REPLACE(),
# SET) — those are already unreachable as statements via the prefix check.
_FORBIDDEN = (
    "insert", "update", "delete", "drop", "alter", "create", "truncate",
    "grant", "revoke", "merge", "call", "exec", "execute",
    "vacuum", "attach", "detach", "into", "reindex",
)

_LINE_COMMENT = re.compile(r"--[^\n]*")
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)


class QueryValidationError(ValueError):
    """Raised when a submitted statement is not a safe, single read query."""


def _strip_comments(sql: str) -> str:
    return _BLOCK_COMMENT.sub(" ", _LINE_COMMENT.sub(" ", sql))


def assert_read_only(sql: str) -> str:
    """Validate `sql` is a single read-only statement. Returns the trimmed SQL."""
    if not sql or not sql.strip():
        raise QueryValidationError("Query is empty.")

    trimmed = sql.strip()
    bare = _strip_comments(trimmed).strip()

    # Allow a single trailing semicolon; reject anything that chains statements.
    without_trailing = bare.rstrip().rstrip(";").rstrip()
    if ";" in without_trailing:
        raise QueryValidationError("Only a single statement can be run at a time.")

    lowered = bare.lower()
    if not lowered.startswith(_ALLOWED_PREFIXES):
        raise QueryValidationError(
            "Only read-only queries (SELECT / WITH) are allowed in the editor."
        )

    for word in _FORBIDDEN:
        if re.search(rf"\b{word}\b", lowered):
            raise QueryValidationError(
                f"The keyword '{word.upper()}' is not permitted in the query editor."
            )

    return without_trailing


def _columns_from_rows(rows: list[dict]) -> list[str]:
    return list(rows[0].keys()) if rows else []


def _clean_value(v):
    """Coerce values the JSON renderer can't handle (e.g. raw bytes columns)."""
    if isinstance(v, (bytes, bytearray, memoryview)):
        return f"<binary {len(bytes(v))} bytes>"
    return v


def _clean_rows(rows: list[dict]) -> list[dict]:
    return [{k: _clean_value(val) for k, val in row.items()} for row in rows]


def run_query(datasource, sql: str) -> dict:
    """Execute a validated read-only query and return a bounded result set."""
    safe_sql = assert_read_only(sql)

    # Wrap in a bounded subquery so we never pull more than MAX_RESULT_ROWS + 1
    # rows across the wire, regardless of what the user wrote.
    wrapped = f"SELECT * FROM (\n{safe_sql}\n) AS dgp_qe_sub LIMIT {MAX_RESULT_ROWS + 1}"

    connector = get_connector(datasource.db_type, datasource.get_credentials())
    started = time.perf_counter()
    rows = connector.execute_query(wrapped)
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    truncated = len(rows) > MAX_RESULT_ROWS
    if truncated:
        rows = rows[:MAX_RESULT_ROWS]

    return {
        "columns": _columns_from_rows(rows),
        "rows": _clean_rows(rows),
        "row_count": len(rows),
        "truncated": truncated,
        "elapsed_ms": elapsed_ms,
    }


def preview_table(datasource, table_name: str, limit: int = DEFAULT_PREVIEW_ROWS) -> dict:
    """Return the first `limit` rows of `table_name` (optionally schema-qualified)."""
    if not table_name or not table_name.strip():
        raise QueryValidationError("A table name is required.")

    limit = max(1, min(int(limit or DEFAULT_PREVIEW_ROWS), MAX_PREVIEW_ROWS))

    connector = get_connector(datasource.db_type, datasource.get_credentials())
    parts = [p for p in table_name.strip().split(".") if p]
    qualified = ".".join(connector.quote_identifier(p) for p in parts)

    started = time.perf_counter()
    rows = connector.execute_query(f"SELECT * FROM {qualified} LIMIT {limit}")
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    return {
        "columns": _columns_from_rows(rows),
        "rows": _clean_rows(rows),
        "row_count": len(rows),
        "truncated": len(rows) >= limit,
        "elapsed_ms": elapsed_ms,
    }


def list_tables(datasource) -> list[dict]:
    """Introspect the environment and return a compact table list for the sidebar."""
    connector = get_connector(datasource.db_type, datasource.get_credentials())
    schema = connector.get_schema()

    tables = []
    for name, meta in schema.items():
        columns = [
            {
                "name": c["name"],
                "data_type": c["data_type"],
                "nullable": c["nullable"],
                "is_primary_key": c["is_primary_key"],
                "is_foreign_key": c["is_foreign_key"],
            }
            for c in meta.get("columns", [])
        ]
        tables.append(
            {
                "name": name,
                "schema": meta.get("schema", ""),
                "column_count": len(columns),
                "row_count_estimate": meta.get("row_count_estimate"),
                "columns": columns,
            }
        )

    tables.sort(key=lambda t: t["name"].lower())
    return tables


# ── Emailing results ──────────────────────────────────────────────────────

def parse_recipients(raw: str) -> list[str]:
    """Split a comma/semicolon/newline separated string into de-duped valid emails."""
    seen: list[str] = []
    for part in re.split(r"[,;\n]+", raw or ""):
        addr = part.strip()
        if not addr or addr in seen:
            continue
        try:
            validate_email(addr)
        except DjangoValidationError:
            continue
        seen.append(addr)
    return seen


def rows_to_csv(columns: list[str], rows: list[dict]) -> bytes:
    """Serialise a result set to UTF-8 CSV bytes."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(columns)
    for row in rows:
        writer.writerow(
            [("" if row.get(c) is None else row.get(c)) for c in columns]
        )
    return buf.getvalue().encode("utf-8")


def email_query_results(*, datasource, sql: str, query_name: str,
                        recipients: list[str], message: str = "", target: str = "") -> dict:
    """Run `sql` and email its rows (CSV attachment) to `recipients`."""
    from core.email import send_query_results

    if not recipients:
        raise QueryValidationError("No valid recipient email addresses were provided.")

    result = run_query(datasource, sql)
    csv_bytes = rows_to_csv(result["columns"], result["rows"])
    sent = send_query_results(
        recipients,
        query_name=query_name,
        message=message,
        csv_bytes=csv_bytes,
        csv_name=f"{slugify_identifier(query_name)}.csv",
        row_count=result["row_count"],
        target=target,
    )
    return {
        "sent": sent,
        "recipients": recipients,
        "row_count": result["row_count"],
        "truncated": result["truncated"],
    }


# ── Scheduled materialization ──────────────────────────────────────────────

def slugify_identifier(name: str, maxlen: int = 40) -> str:
    """Lowercase, collapse non-alphanumerics to underscores — a safe table name."""
    slug = re.sub(r"[^a-z0-9]+", "_", (name or "").lower()).strip("_")
    return slug[:maxlen] or "query"


def _ensure_schedules_schema(connector, db_type: str, schema: str = "schedules") -> None:
    """Create the target schema/database if it doesn't exist (no-op for sqlite)."""
    if db_type == "postgresql":
        ddl = f'CREATE SCHEMA IF NOT EXISTS {connector.quote_identifier(schema)}'
    elif db_type == "mysql":
        ddl = f"CREATE DATABASE IF NOT EXISTS {connector.quote_identifier(schema)}"
    else:
        return
    try:
        connector.execute_ddl(ddl)
    except Exception as exc:
        logger.warning("Could not ensure schedules schema '%s': %s", schema, exc)


def _qualified_target(connector, db_type: str, schema: str, table: str) -> str:
    """Quoted `schema.table` for pg/mysql; a single `schema_table` name for sqlite."""
    if db_type in ("postgresql", "mysql"):
        return f"{connector.quote_identifier(schema)}.{connector.quote_identifier(table)}"
    return connector.quote_identifier(f"{schema}_{table}")


def _target_exists(connector, qualified: str) -> bool:
    try:
        connector.execute_query(f"SELECT 1 FROM {qualified} LIMIT 0")
        return True
    except Exception:
        return False


def materialize_query(schedule, *, trigger: str = "schedule"):
    """
    Run the schedule's SavedQuery and write its rows into the target table.

    - replace: DROP + CREATE TABLE AS SELECT
    - append:  CREATE TABLE AS SELECT on first run, INSERT ... SELECT thereafter

    Always records a QueryRun and advances `next_run_at` — a failed run must not
    wedge the routine (mirrors data_islands.refresh_island).
    """
    from .models import QueryRun

    started = time.perf_counter()
    ds = schedule.datasource
    db_type = ds.db_type

    status = "success"
    error_message = ""
    row_count = None

    try:
        inner_sql = assert_read_only(schedule.saved_query.sql_text)
        connector = get_connector(db_type, ds.get_credentials())
        _ensure_schedules_schema(connector, db_type, schedule.target_schema)
        qualified = _qualified_target(connector, db_type, schedule.target_schema, schedule.target_table)

        exists = _target_exists(connector, qualified)
        if schedule.write_mode == "append" and exists:
            connector.execute_ddl(f"INSERT INTO {qualified} {inner_sql}")
        else:
            if exists:
                connector.execute_ddl(f"DROP TABLE IF EXISTS {qualified}")
            connector.execute_ddl(f"CREATE TABLE {qualified} AS {inner_sql}")

        count_rows = connector.execute_query(f"SELECT COUNT(*) AS c FROM {qualified}")
        if count_rows:
            row_count = int(next(iter(count_rows[0].values())))
    except Exception as exc:
        status = "error"
        error_message = str(exc)
        logger.warning("materialize_query failed for schedule %s: %s", schedule.id, exc)

    # Optional mailer — never let an email failure fail the run.
    email_status = ""
    if status == "success" and schedule.email_enabled:
        recipients = parse_recipients(schedule.email_recipients)
        if not recipients:
            email_status = "skipped"
        else:
            try:
                res = email_query_results(
                    datasource=ds,
                    sql=schedule.saved_query.sql_text,
                    query_name=schedule.saved_query.name,
                    recipients=recipients,
                    message=schedule.email_message,
                    target=f"{schedule.target_schema}.{schedule.target_table}",
                )
                email_status = "sent" if res["sent"] else "failed"
            except Exception as exc:
                email_status = "failed"
                logger.warning("materialize_query mailer failed for schedule %s: %s", schedule.id, exc)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    now = timezone.now()

    run = QueryRun.objects.create(
        schedule=schedule,
        status=status,
        write_mode=schedule.write_mode,
        target=f"{schedule.target_schema}.{schedule.target_table}",
        row_count=row_count,
        elapsed_ms=elapsed_ms,
        error_message=error_message,
        trigger=trigger,
        email_status=email_status,
    )

    schedule.last_run_at = now
    schedule.last_status = status
    schedule.last_error = error_message
    schedule.last_row_count = row_count
    schedule.next_run_at = compute_next_run(schedule.cadence_type, schedule.cadence_value, now)
    schedule.save(update_fields=[
        "last_run_at", "last_status", "last_error", "last_row_count",
        "next_run_at", "updated_at",
    ])
    return run


def run_due_query_schedules(now=None) -> list[dict]:
    """Materialize every active schedule whose next_run_at is in the past."""
    from .models import QuerySchedule

    now = now or timezone.now()
    due = (
        QuerySchedule.objects
        .filter(is_active=True, next_run_at__isnull=False, next_run_at__lte=now)
        .select_related("saved_query", "datasource")
    )
    results = []
    for schedule in due:
        run = materialize_query(schedule, trigger="schedule")
        results.append({
            "id": str(schedule.id),
            "name": schedule.saved_query.name,
            "status": run.status,
            "error": run.error_message,
        })
    return results
