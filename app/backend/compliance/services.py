"""
Compliance erasure engine.

Three public functions:
  build_erasure_plan(request_id)  — BFS FK traversal, persists ErasurePlan
  execute_erasure(request_id)     — transactional DELETE execution, writes audit log
"""

from __future__ import annotations

import csv
import io
import logging
from collections import defaultdict, deque
from datetime import timezone as dt_timezone

from django.utils import timezone

from core.email import send_access_report as _email_access_report
from datasources.connectors import get_connector
from catalogue.models import RelationshipRule, ColumnCatalogue, TableCatalogue, CatalogueRun

from .models import ErasureRequest, ErasurePlan, ErasureApproval, ErasureAuditLog, AccessRequest, AccessDiscovery

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Step A — resolve identifiers
# ---------------------------------------------------------------------------

def resolve_identifiers(request: ErasureRequest) -> list[str]:
    """Parse request.input_raw into a flat list of string identifier values."""
    itype = request.input_type
    raw = request.input_raw or ""

    if itype == "text":
        values = [v.strip() for v in raw.replace("\n", ",").split(",") if v.strip()]

    elif itype == "csv":
        reader = csv.reader(io.StringIO(raw))
        values = []
        for i, row in enumerate(reader):
            if i == 0 and row and row[0].strip().lower() in ("id", "identifier", request.identifier_column):
                continue  # skip header
            if row:
                values.append(str(row[0]).strip())

    elif itype == "table":
        # input_raw holds "table_name|column_name"
        parts = raw.split("|", 1)
        if len(parts) != 2:
            raise ValueError("input_raw for type='table' must be 'table_name|column_name'")
        src_table, src_col = parts
        connector = get_connector(
            request.datasource.db_type,
            request.datasource.get_credentials(),
        )
        q = connector.quote_identifier
        rows = connector.execute_query(
            f"SELECT DISTINCT {q(src_col)} FROM {q(src_table)}",
        )
        values = [str(r[src_col]) for r in rows if r.get(src_col) is not None]

    else:
        raise ValueError(f"Unknown input_type: {itype}")

    return values


# ---------------------------------------------------------------------------
# Step B — build erasure plan (background thread)
# ---------------------------------------------------------------------------

def build_erasure_plan(request_id: str) -> None:
    """BFS the FK graph starting from the root identifier table.

    Persists an ErasurePlan and advances request.status to 'planned'.
    Non-fatal: on error, sets request.status = 'failed' with error_message.
    """
    try:
        req = ErasureRequest.objects.select_related("datasource").get(pk=request_id)
        _do_build_plan(req)
    except ErasureRequest.DoesNotExist:
        logger.error("build_erasure_plan: request %s not found", request_id)
    except Exception as exc:
        logger.exception("build_erasure_plan failed for request %s", request_id)
        try:
            ErasureRequest.objects.filter(pk=request_id).update(
                status="failed", error_message=str(exc)
            )
        except Exception:
            pass


def _do_build_plan(req: ErasureRequest) -> None:
    # 1. Resolve identifiers
    resolved = resolve_identifiers(req)
    if not resolved:
        raise ValueError("No identifier values could be resolved from the provided input.")
    req.input_resolved = resolved
    req.save(update_fields=["input_resolved"])

    # 2. Get connector
    connector = get_connector(req.datasource.db_type, req.datasource.get_credentials())

    # 3. Build FK adjacency map: parent_table → [(child_table, child_fk_col, parent_pk_col)]
    # Source 1: RelationshipRules
    rules = RelationshipRule.objects.filter(datasource=req.datasource, is_active=True)
    # from_table is child (FK side), to_table is parent (PK side)
    child_map: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
    for rule in rules:
        child_map[rule.to_table].append((rule.from_table, rule.from_column, rule.to_column))

    # Source 2: ColumnCatalogue FK constraints (supplement, avoid duplicates)
    latest_run = (
        CatalogueRun.objects.filter(datasource=req.datasource, status="completed")
        .order_by("-created_at")
        .first()
    )
    if latest_run:
        fk_cols = ColumnCatalogue.objects.filter(
            table__run=latest_run,
            is_foreign_key=True,
        ).select_related("table")
        existing_edges = {(r.from_table, r.from_column, r.to_table) for r in rules}
        for col in fk_cols:
            ref = col.foreign_key_references
            if not ref:
                continue
            parent_table = ref.get("table", "")
            parent_col = ref.get("column", "id")
            edge_key = (col.table.table_name, col.column_name, parent_table)
            if edge_key not in existing_edges:
                child_map[parent_table].append((col.table.table_name, col.column_name, parent_col))
                existing_edges.add(edge_key)

    # 4. Find PK column and fully-qualified name for each table from catalogue
    pk_map: dict[str, str] = {}
    full_name_map: dict[str, str] = {}
    if latest_run:
        pk_cols = ColumnCatalogue.objects.filter(
            table__run=latest_run, is_primary_key=True
        ).select_related("table")
        for col in pk_cols:
            pk_map[col.table.table_name] = col.column_name

        for tbl in TableCatalogue.objects.filter(run=latest_run):
            full_name_map[tbl.table_name] = tbl.full_name or tbl.table_name

    # 5. PII columns per table
    pii_map: dict[str, list[str]] = defaultdict(list)
    if latest_run:
        pii_cols = ColumnCatalogue.objects.filter(table__run=latest_run).select_related("table")
        for col in pii_cols:
            eff = col.effective_pii_likelihood
            if eff in ("high", "medium"):
                pii_map[col.table.table_name].append(col.column_name)

    # 6. BFS
    plan_entries: list[dict] = []
    visited: set[str] = set()
    queue: deque[tuple[str, str, list[str], str | None]] = deque()
    # (table_name, lookup_column, lookup_values, via_description)
    queue.append((req.identifier_table, req.identifier_column, resolved, None))

    while queue:
        table, col, values, via = queue.popleft()
        if table in visited:
            continue
        visited.add(table)

        pk_col = pk_map.get(table, "id")
        full_name = full_name_map.get(table, table)
        q = connector.quote_identifier
        placeholders = ", ".join(["%s"] * len(values))
        rows = connector.execute_query(
            f"SELECT DISTINCT {q(pk_col)} FROM {_q_table(connector, full_name)} WHERE {q(col)} IN ({placeholders})",
            list(values),
        )
        row_pks = [str(r[pk_col]) for r in rows if r.get(pk_col) is not None]

        if not row_pks:
            continue

        plan_entries.append({
            "table": table,
            "full_name": full_name,
            "pk_column": pk_col,
            "row_pks": row_pks,
            "pii_columns": pii_map.get(table, []),
            "via": via,
        })

        # Enqueue children
        for child_table, child_fk_col, _parent_pk_col in child_map.get(table, []):
            if child_table not in visited:
                queue.append((
                    child_table,
                    child_fk_col,
                    row_pks,
                    f"{child_table}.{child_fk_col} → {table}.{pk_col}",
                ))

    if not plan_entries:
        raise ValueError(
            f"No matching rows found for the provided identifiers in table "
            f"'{req.identifier_table}'.{req.identifier_column}."
        )

    total_rows = sum(len(e["row_pks"]) for e in plan_entries)

    # Persist plan
    ErasurePlan.objects.filter(request=req).delete()
    ErasurePlan.objects.create(request=req, plan_data=plan_entries, total_rows=total_rows)
    req.status = "planned"
    req.save(update_fields=["status"])
    logger.info(
        "Erasure plan built for request %s: %d tables, %d rows",
        req.id, len(plan_entries), total_rows,
    )


# ---------------------------------------------------------------------------
# Step C — execute erasure (background thread)
# ---------------------------------------------------------------------------

def execute_erasure(request_id: str) -> None:
    """Execute the approved erasure plan transactionally.

    Deletes child tables before parent tables (reverse BFS order).
    Rolls back entirely on failure, sets status='failed'.
    Writes an immutable ErasureAuditLog on success.
    """
    try:
        req = ErasureRequest.objects.select_related("datasource", "requested_by").get(pk=request_id)
        _do_execute(req)
    except ErasureRequest.DoesNotExist:
        logger.error("execute_erasure: request %s not found", request_id)
    except Exception as exc:
        logger.exception("execute_erasure failed for request %s", request_id)
        try:
            ErasureRequest.objects.filter(pk=request_id).update(
                status="failed", error_message=str(exc)
            )
        except Exception:
            pass


def _do_execute(req: ErasureRequest) -> None:
    if req.status != "approved":
        raise ValueError(f"Cannot execute request in status '{req.status}'")

    plan = req.plan
    plan_entries: list[dict] = plan.plan_data

    # Topological order: entries with via=None (root) go last; deepest children first
    # We use the order they were added in BFS (children appended after parent), so reversing gives child-first.
    ordered = list(reversed(plan_entries))

    connector = get_connector(req.datasource.db_type, req.datasource.get_credentials())
    q = connector.quote_identifier

    # Build DELETE statements using the schema-qualified full_name stored in the plan
    statements: list[tuple[str, list]] = []
    for entry in ordered:
        pks = entry["row_pks"]
        placeholders = ", ".join(["%s"] * len(pks))
        table_ref = _q_table(connector, entry.get("full_name", entry["table"]))
        statements.append((
            f"DELETE FROM {table_ref} WHERE {q(entry['pk_column'])} IN ({placeholders})",
            pks,
        ))

    req.status = "executing"
    req.save(update_fields=["status"])
    try:
        connector.execute_writes_transactionally(statements)
    except Exception as exc:
        req.status = "failed"
        req.error_message = str(exc)
        req.save(update_fields=["status", "error_message"])
        logger.error("Erasure execution failed for request %s: %s", req.id, exc)
        return

    # Write immutable audit log
    approval = getattr(req, "approval", None)
    if approval and approval.approved_by:
        approver = f"{approval.approved_by.username} ({approval.approved_by.email})"
        approved_at = approval.approved_at
    else:
        approver = "unknown"
        approved_at = timezone.now()

    executed_at = timezone.now()
    tables_affected = [e["table"] for e in plan_entries]
    total_deleted = sum(len(e["row_pks"]) for e in plan_entries)

    ErasureAuditLog.objects.create(
        request_id=str(req.id),
        data_principal_id=req.data_principal_id,
        identifier_field=f"{req.identifier_table}.{req.identifier_column}",
        identifier_values=req.input_resolved,
        tables_affected=tables_affected,
        rows_deleted=total_deleted,
        approver_identity=approver,
        approved_at=approved_at,
        executed_at=executed_at,
    )

    req.status = "completed"
    req.save(update_fields=["status"])
    logger.info(
        "Erasure completed for request %s: %d tables, %d rows deleted",
        req.id, len(tables_affected), total_deleted,
    )
    logger.info(
        "Confirmation notification sent to data principal '%s' for request %s",
        req.data_principal_id, req.id,
    )


# ---------------------------------------------------------------------------
# Data Access Request (DSAR) — Step B: BFS discovery (background thread)
# ---------------------------------------------------------------------------

def discover_data_access(request_id: str) -> None:
    """BFS the FK graph from the identifier table, collect personal data inventory.

    Read-only — no deletions. Persists AccessDiscovery, advances status to 'discovered'.
    """
    try:
        req = AccessRequest.objects.select_related("datasource").get(pk=request_id)
        _do_discover(req)
    except AccessRequest.DoesNotExist:
        logger.error("discover_data_access: request %s not found", request_id)
    except Exception as exc:
        logger.exception("discover_data_access failed for request %s", request_id)
        try:
            AccessRequest.objects.filter(pk=request_id).update(
                status="failed", error_message=str(exc)
            )
        except Exception:
            pass


def _do_discover(req: AccessRequest) -> None:
    identifier_values = [req.subject_id]

    connector = get_connector(req.datasource.db_type, req.datasource.get_credentials())

    # Build FK adjacency map (same logic as erasure)
    rules = RelationshipRule.objects.filter(datasource=req.datasource, is_active=True)
    child_map: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
    for rule in rules:
        child_map[rule.to_table].append((rule.from_table, rule.from_column, rule.to_column))

    latest_run = (
        CatalogueRun.objects.filter(datasource=req.datasource, status="completed")
        .order_by("-created_at")
        .first()
    )
    if latest_run:
        fk_cols = ColumnCatalogue.objects.filter(table__run=latest_run, is_foreign_key=True).select_related("table")
        existing_edges = {(r.from_table, r.from_column, r.to_table) for r in rules}
        for col in fk_cols:
            ref = col.foreign_key_references
            if not ref:
                continue
            parent_table = ref.get("table", "")
            parent_col = ref.get("column", "id")
            edge_key = (col.table.table_name, col.column_name, parent_table)
            if edge_key not in existing_edges:
                child_map[parent_table].append((col.table.table_name, col.column_name, parent_col))
                existing_edges.add(edge_key)

    # Build catalogue lookup maps
    pk_map: dict[str, str] = {}
    full_name_map: dict[str, str] = {}
    business_purpose_map: dict[str, str] = {}
    pii_map: dict[str, list[str]] = defaultdict(list)
    data_category_map: dict[str, list[str]] = defaultdict(list)

    if latest_run:
        for col in ColumnCatalogue.objects.filter(table__run=latest_run, is_primary_key=True).select_related("table"):
            pk_map[col.table.table_name] = col.column_name

        for tbl in TableCatalogue.objects.filter(run=latest_run):
            full_name_map[tbl.table_name] = tbl.full_name or tbl.table_name
            bp = tbl.effective_business_purpose
            if bp:
                business_purpose_map[tbl.table_name] = bp

        for col in ColumnCatalogue.objects.filter(table__run=latest_run).select_related("table"):
            eff_pii = col.effective_pii_likelihood
            eff_cat = col.effective_data_category
            if eff_pii in ("high", "medium"):
                pii_map[col.table.table_name].append(col.column_name)
            if eff_cat and eff_cat not in data_category_map[col.table.table_name]:
                data_category_map[col.table.table_name].append(eff_cat)

    # BFS
    discovery_entries: list[dict] = []
    visited: set[str] = set()
    queue: deque[tuple[str, str, list[str], str | None]] = deque()
    queue.append((req.identifier_table, req.identifier_column, identifier_values, None))

    while queue:
        table, col, values, via = queue.popleft()
        if table in visited:
            continue
        visited.add(table)

        pk_col = pk_map.get(table, "id")
        full_name = full_name_map.get(table, table)
        q = connector.quote_identifier
        placeholders = ", ".join(["%s"] * len(values))
        rows = connector.execute_query(
            f"SELECT DISTINCT {q(pk_col)} FROM {_q_table(connector, full_name)} WHERE {q(col)} IN ({placeholders})",
            list(values),
        )
        row_pks = [str(r[pk_col]) for r in rows if r.get(pk_col) is not None]

        if not row_pks:
            continue

        discovery_entries.append({
            "table":            table,
            "full_name":        full_name,
            "pk_column":        pk_col,
            "row_count":        len(row_pks),
            "row_pks":          row_pks,
            "pii_columns":      pii_map.get(table, []),
            "data_categories":  data_category_map.get(table, []),
            "business_purpose": business_purpose_map.get(table, ""),
            "via":              via,
        })

        for child_table, child_fk_col, _parent_pk_col in child_map.get(table, []):
            if child_table not in visited:
                queue.append((
                    child_table,
                    child_fk_col,
                    row_pks,
                    f"{child_table}.{child_fk_col} → {table}.{pk_col}",
                ))

    if not discovery_entries:
        raise ValueError(
            f"No matching rows found for subject ID '{req.subject_id}' in "
            f"'{req.identifier_table}'.{req.identifier_column}."
        )

    total_rows = sum(e["row_count"] for e in discovery_entries)
    AccessDiscovery.objects.filter(request=req).delete()
    AccessDiscovery.objects.create(request=req, discovery_data=discovery_entries, total_rows=total_rows)
    req.status = "discovered"
    req.save(update_fields=["status"])
    logger.info(
        "Access discovery complete for request %s: %d tables, %d rows",
        req.id, len(discovery_entries), total_rows,
    )


# ---------------------------------------------------------------------------
# Data Access Request — Step C: generate report + send
# ---------------------------------------------------------------------------

def generate_access_report(request_id: str) -> dict:
    """Build the Part A DSAR report from discovery data. Returns a dict (not persisted)."""
    req = AccessRequest.objects.select_related("datasource", "requested_by").get(pk=request_id)
    discovery = req.discovery
    entries = discovery.discovery_data

    table_count = len(entries)
    total_rows = discovery.total_rows

    inventory = []
    for e in entries:
        inventory.append({
            "table":            e["table"],
            "business_purpose": e.get("business_purpose") or "General data processing",
            "record_count":     e["row_count"],
            "pii_columns":      e.get("pii_columns", []),
            "data_categories":  e.get("data_categories", []),
            "via":              e.get("via"),
            "is_primary_table": e.get("via") is None,
        })

    summary = (
        f"Your personal data is stored across {table_count} "
        f"{'table' if table_count == 1 else 'tables'} "
        f"containing {total_rows} {'record' if total_rows == 1 else 'records'} "
        f"in the '{req.datasource.name}' data source."
    )

    return {
        "generated_at":    timezone.now().isoformat(),
        "request_id":      str(req.id),
        "datasource_name": req.datasource.name,
        "subject": {
            "id":              req.subject_id,
            "email":           req.subject_email,
            "identifier_field": f"{req.identifier_table}.{req.identifier_column}",
        },
        "summary":        summary,
        "data_inventory": inventory,
        "legal_basis":    (
            "Under the Digital Personal Data Protection Act (DPDPA) 2023, Section 11, "
            "you have the right to obtain a summary of the personal data being processed "
            "about you and the identities of all Data Fiduciaries with whom your personal "
            "data has been shared."
        ),
        "notes": (
            "This report provides a summary of personal data categories. "
            "It does not constitute a raw data export. "
            "For legal requests, please contact the Data Protection Officer."
        ),
    }


def send_access_report(request_id: str, extra_emails: list[str] | None = None) -> None:
    """Send the DPDPA Part A access report to the data subject and any extra recipients."""
    req = AccessRequest.objects.get(pk=request_id)
    recipients = [req.subject_email] + (extra_emails or [])
    report = generate_access_report(request_id)
    _email_access_report(
        recipients,
        subject_name=req.subject_name or req.subject_email,
        report=report,
    )
    req.status = "sent"
    req.save(update_fields=["status"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _q_table(connector, name: str) -> str:
    """Quote a table name that may be schema-qualified (e.g. 'sales.orders').

    Splits on the first '.' and quotes each part separately so the result is
    correct for both PostgreSQL ("sales"."orders") and MySQL (`sales`.`orders`).
    Plain names with no schema are quoted as-is.
    """
    if "." in name:
        schema, table = name.split(".", 1)
        return f"{connector.quote_identifier(schema)}.{connector.quote_identifier(table)}"
    return connector.quote_identifier(name)
