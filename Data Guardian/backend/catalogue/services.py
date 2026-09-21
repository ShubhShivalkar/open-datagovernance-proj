"""
Catalogue generation service.

Orchestrates:
  1. Introspect the database via the appropriate connector
  2. Generate AI descriptions for each table
  3. Persist everything to the catalogue models
"""

from __future__ import annotations

import logging
from django.utils import timezone

from datasources.models import DataSource
from datasources.connectors import get_connector
from ai.manager import get_ai_provider
from .models import CatalogueRun, TableCatalogue, ColumnCatalogue, RelationshipRule

logger = logging.getLogger(__name__)


def generate_catalogue(
    datasource_id: str,
    ai_provider_name: str | None = None,
    ai_api_key: str | None = None,
    ai_model: str | None = None,
    existing_run: "CatalogueRun | None" = None,
    refresh_mode: str = "incremental",
) -> CatalogueRun:
    """
    Catalogue generation pipeline for a single DataSource.

    SECURITY: Only schema metadata is read from the database (table names, column
    names, data types, constraints). No user data rows are ever accessed or stored.
    Queries are limited to information_schema / system catalog views only.

    Args:
        datasource_id: UUID of the DataSource to process.
        ai_provider_name: Override the AI provider (e.g. "anthropic", "openai").
        ai_api_key: Override the AI API key.
        ai_model: Override the AI model identifier.
        existing_run: A pre-created CatalogueRun to update (avoids duplicate rows).
                      If None, a new run is created.
        refresh_mode: "incremental" (only new tables) or "full" (regenerate everything).

    Returns:
        The completed (or failed) CatalogueRun instance.
    """
    ds = DataSource.objects.get(pk=datasource_id)
    provider = get_ai_provider(
        provider_name=ai_provider_name,
        api_key=ai_api_key,
        model=ai_model,
    )

    if existing_run is not None:
        run = existing_run
        run.status = "running"
        run.ai_provider = provider.PROVIDER_NAME
        run.ai_model = provider.model
        run.started_at = timezone.now()
        run.save(update_fields=["status", "ai_provider", "ai_model", "started_at"])
    else:
        run = CatalogueRun.objects.create(
            datasource=ds,
            status="running",
            ai_provider=provider.PROVIDER_NAME,
            ai_model=provider.model,
            started_at=timezone.now(),
        )

    try:
        # ── Step 1: Introspect schema metadata only ────────────────────
        # SECURITY: connector queries information_schema / system catalog views
        # only — no SELECT on user tables, no row data is ever read.
        logger.info("[%s] Introspecting schema metadata for datasource '%s'", run.id, ds.name)
        connector = get_connector(ds.db_type, ds.get_credentials())
        schema = connector.get_schema()

        # For incremental, filter to only tables not already in the previous completed run
        if refresh_mode == "incremental":
            prev_run = (
                CatalogueRun.objects.filter(datasource=ds, status="completed")
                .exclude(pk=run.pk)
                .order_by("-created_at")
                .first()
            )
            existing_table_names = (
                set(prev_run.tables.values_list("full_name", flat=True))
                if prev_run else set()
            )
            if existing_table_names:
                schema = {k: v for k, v in schema.items() if k not in existing_table_names}
                logger.info("[%s] Incremental: %d new tables to process", run.id, len(schema))

        run.tables_total = len(schema)
        run.save(update_fields=["tables_total"])

        if not schema:
            run.status = "completed"
            run.completed_at = timezone.now()
            run.save(update_fields=["status", "completed_at"])
            logger.info("[%s] No new tables to catalogue (incremental, up to date)", run.id)
            return run

        # ── Step 2: Per-table: sample data → AI description → persist ─
        logger.info("[%s] Generating AI descriptions for %d tables", run.id, len(schema))

        for table_key, table_info in schema.items():
            # 2a. Sample rows (best-effort; returns [] silently on any error)
            sample_rows = connector.get_sample_data(table_key, limit=5)
            if sample_rows:
                logger.debug("[%s] Sampled %d rows from %s", run.id, len(sample_rows), table_key)

            # 2b. Generate AI description
            table_desc = provider.generate_table_descriptions(
                table_name=table_key,
                schema_info=table_info,
                context=ds.business_context,
                sample_rows=sample_rows or None,
            )

            # 2c. Persist TableCatalogue
            schema_name = table_info.get("schema", "")
            table_cat = TableCatalogue.objects.create(
                run=run,
                datasource=ds,
                schema_name=schema_name,
                table_name=table_key.split(".")[-1],
                full_name=table_key,
                raw_schema=table_info,
                row_count_estimate=table_info.get("row_count_estimate"),
                ai_description=table_desc.description if table_desc else "",
                ai_business_purpose=table_desc.business_purpose if table_desc else "",
                ai_domain=table_desc.domain if table_desc else "",
            )

            col_descriptions = {c.name: c for c in (table_desc.columns if table_desc else [])}

            for position, col in enumerate(table_info.get("columns", [])):
                col_desc = col_descriptions.get(col["name"])
                ColumnCatalogue.objects.create(
                    table=table_cat,
                    column_name=col["name"],
                    data_type=col.get("data_type", ""),
                    nullable=col.get("nullable", True),
                    is_primary_key=col.get("is_primary_key", False),
                    is_foreign_key=col.get("is_foreign_key", False),
                    foreign_key_references=col.get("foreign_key_references"),
                    default_value=col.get("default_value"),
                    max_length=col.get("max_length"),
                    native_comment=col.get("comment"),
                    ai_description=col_desc.description if col_desc else "",
                    ai_business_name=col_desc.business_name if col_desc else "",
                    ai_data_category=col_desc.data_category if col_desc else "other",
                    ai_pii_likelihood=col_desc.pii_likelihood if col_desc else "none",
                    ordinal_position=position,
                )

            # 2d. Progress tracking
            run.tables_processed += 1
            run.save(update_fields=["tables_processed"])

        # ── Step 3: AI relationship inference ─────────────────────────
        # Uses the AI descriptions just persisted to infer table relationships
        # that aren't captured by FK constraints or column-name heuristics.
        # Non-fatal: a failure here does not mark the run as failed.
        logger.info("[%s] Inferring table relationships from AI descriptions", run.id)
        try:
            catalogued_tables = list(
                TableCatalogue.objects.filter(run=run).prefetch_related("columns")
            )
            known_table_names = {t.table_name.lower() for t in catalogued_tables}

            tables_for_inference = []
            for tbl in catalogued_tables:
                columns_info = [
                    {
                        "name":           col.column_name,
                        "description":    col.effective_description,
                        "is_primary_key": col.is_primary_key,
                        "is_foreign_key": col.is_foreign_key,
                        "data_category":  col.effective_data_category,
                    }
                    for col in tbl.columns.all()
                ]
                tables_for_inference.append({
                    "table_name":  tbl.table_name,
                    "description": tbl.effective_description,
                    "columns":     columns_info,
                })

            suggestions = provider.infer_relationships(
                tables_for_inference,
                context=ds.business_context or "",
            )

            created_count = 0
            for s in suggestions:
                # Validate both table names against the catalogue
                if s.from_table.lower() not in known_table_names:
                    continue
                if s.to_table.lower() not in known_table_names:
                    continue
                if not s.from_column or not s.to_column:
                    continue

                # get_or_create: never overwrite a user-created or already-saved rule
                _, created = RelationshipRule.objects.get_or_create(
                    datasource=ds,
                    from_table=s.from_table,
                    from_column=s.from_column,
                    to_table=s.to_table,
                    to_column=s.to_column,
                    defaults={
                        "cardinality": s.cardinality,
                        "label":       s.label,
                        "is_auto":     True,
                        "is_active":   True,
                        "source":      "ai",
                    },
                )
                if created:
                    created_count += 1

            logger.info(
                "[%s] Relationship inference complete — %d new rules persisted",
                run.id, created_count,
            )
        except Exception as exc:
            logger.warning(
                "[%s] Relationship inference failed (non-fatal): %s", run.id, exc
            )

        run.status = "completed"
        run.completed_at = timezone.now()
        run.save(update_fields=["status", "completed_at"])
        logger.info("[%s] Catalogue generation completed successfully", run.id)

    except Exception as exc:
        logger.exception("[%s] Catalogue generation failed: %s", run.id, exc)
        run.status = "failed"
        run.error_message = str(exc)
        run.completed_at = timezone.now()
        run.save(update_fields=["status", "error_message", "completed_at"])

    return run
