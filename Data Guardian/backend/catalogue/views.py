import threading
from django.utils import timezone
from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter

from datasources.models import DataSource
from .models import CatalogueRun, TableCatalogue, ColumnCatalogue, RelationshipRule
from .serializers import (
    CatalogueRunSerializer,
    TableCatalogueSerializer,
    TableCatalogueListSerializer,
    TableCatalogueUpdateSerializer,
    ColumnCatalogueSerializer,
    ColumnCatalogueUpdateSerializer,
    GenerateCatalogueRequestSerializer,
    RelationshipRuleSerializer,
    RelationshipRuleUpdateSerializer,
)
from .services import generate_catalogue


class CatalogueRunViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    GenericViewSet,
):
    """
    GET /api/catalogue/runs/               — list all runs
    GET /api/catalogue/runs/{id}/          — get a specific run
    POST /api/datasources/{ds_id}/generate-catalogue/   — trigger (on DataSource viewset)
    """

    queryset = CatalogueRun.objects.select_related("datasource").all()
    serializer_class = CatalogueRunSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["datasource", "status"]


class TableCatalogueViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    GenericViewSet,
):
    """
    GET  /api/catalogue/tables/            — list all tables (across all runs)
    GET  /api/catalogue/tables/{id}/       — table detail with columns
    PATCH /api/catalogue/tables/{id}/      — human override
    """

    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ["datasource", "run", "ai_domain"]
    search_fields = ["table_name", "full_name", "ai_description", "description"]

    def get_queryset(self):
        # Return only the latest run's tables for each datasource by default
        # unless ?run=<id> is specified
        run_id = self.request.query_params.get("run")
        if run_id:
            return TableCatalogue.objects.filter(run=run_id).prefetch_related("columns")

        # Latest run per datasource
        from django.db.models import Subquery, OuterRef
        latest_runs = CatalogueRun.objects.filter(
            datasource=OuterRef("datasource"),
            status="completed",
        ).order_by("-created_at").values("id")[:1]

        return TableCatalogue.objects.filter(
            run=Subquery(latest_runs)
        ).prefetch_related("columns")

    def get_serializer_class(self):
        if self.action in ("update", "partial_update"):
            return TableCatalogueUpdateSerializer
        if self.action == "list":
            return TableCatalogueListSerializer
        return TableCatalogueSerializer

    def perform_update(self, serializer):
        # Auto-set verified_at when is_verified is toggled
        extra = {}
        if "is_verified" in serializer.validated_data:
            extra["verified_at"] = timezone.now() if serializer.validated_data["is_verified"] else None
        serializer.save(**extra)


class ColumnCatalogueViewSet(
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    GenericViewSet,
):
    """
    GET   /api/catalogue/columns/{id}/   — column detail
    PATCH /api/catalogue/columns/{id}/   — human override for a single column
    """

    queryset = ColumnCatalogue.objects.select_related("table").all()

    def get_serializer_class(self):
        if self.action in ("update", "partial_update"):
            return ColumnCatalogueUpdateSerializer
        return ColumnCatalogueSerializer


class DataSourceCatalogueActionViewSet(viewsets.ViewSet):
    """
    Adds catalogue-specific actions onto the DataSource endpoint.

    POST /api/datasources/{datasource_pk}/generate-catalogue/
    GET  /api/datasources/{datasource_pk}/latest-catalogue/
    """

    def generate(self, request, datasource_pk=None):
        """
        Trigger async catalogue generation for a datasource.
        Returns the CatalogueRun immediately; generation runs in a background thread.
        """
        ds = DataSource.objects.get(pk=datasource_pk)
        req_ser = GenerateCatalogueRequestSerializer(data=request.data)
        req_ser.is_valid(raise_exception=True)
        params = req_ser.validated_data

        # Create the run record up-front so we can return it immediately
        run = CatalogueRun.objects.create(datasource=ds, status="pending")

        def _run():
            generate_catalogue(
                datasource_id=str(ds.id),
                ai_provider_name=params.get("ai_provider") or None,
                ai_api_key=params.get("ai_api_key") or None,
                ai_model=params.get("ai_model") or None,
                existing_run=run,
                refresh_mode=params.get("refresh_mode", "incremental"),
            )

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

        return Response(
            CatalogueRunSerializer(run).data,
            status=status.HTTP_202_ACCEPTED,
        )

    def latest(self, request, datasource_pk=None):
        """Return the tables from the most recent completed run for this datasource."""
        run = (
            CatalogueRun.objects.filter(
                datasource_id=datasource_pk,
                status="completed",
            )
            .order_by("-created_at")
            .first()
        )
        if not run:
            return Response(
                {"detail": "No completed catalogue run found for this datasource."},
                status=status.HTTP_404_NOT_FOUND,
            )

        tables = TableCatalogue.objects.filter(run=run).prefetch_related("columns")
        return Response(
            {
                "run": CatalogueRunSerializer(run).data,
                "tables": TableCatalogueListSerializer(tables, many=True).data,
            }
        )

    def relationships(self, request, datasource_pk=None):
        """
        GET  /api/datasources/{id}/relationships/
        Returns table nodes + relationship rules (FK-detected, name-based, manual).
        """
        ds = DataSource.objects.get(pk=datasource_pk)

        run = (
            CatalogueRun.objects.filter(datasource=ds, status="completed")
            .order_by("-created_at")
            .first()
        )
        if not run:
            return Response({"tables": [], "rules": []})

        tables_qs = TableCatalogue.objects.filter(run=run).prefetch_related("columns")

        # Build table node list
        tables_out = []
        table_name_map = {}   # table_name → entry (for name-based detection)
        for tbl in tables_qs:
            pk_cols = [c.column_name for c in tbl.columns.all() if c.is_primary_key]
            fk_cols = [
                {
                    "column": c.column_name,
                    "references_table": (c.foreign_key_references or {}).get("table", ""),
                    "references_column": (c.foreign_key_references or {}).get("column", ""),
                }
                for c in tbl.columns.all()
                if c.is_foreign_key and c.foreign_key_references
            ]
            entry = {
                "id": str(tbl.id),
                "table_name": tbl.table_name,
                "full_name": tbl.full_name,
                "schema_name": tbl.schema_name,
                "pk_columns": pk_cols,
                "fk_columns": fk_cols,
                "column_count": tbl.columns.count(),
                "row_count_estimate": tbl.row_count_estimate,
                # All columns for dropdown population
                "all_columns": [c.column_name for c in tbl.columns.all()],
            }
            tables_out.append(entry)
            table_name_map[tbl.table_name.lower()] = entry

        # Build auto rules from explicit FK constraints
        auto_rules = {}
        for tbl_entry in tables_out:
            for fk in tbl_entry["fk_columns"]:
                key = (tbl_entry["table_name"], fk["column"], fk["references_table"], fk["references_column"])
                auto_rules[key] = {
                    "id": f"auto-fk-{tbl_entry['table_name']}-{fk['column']}",
                    "from_table": tbl_entry["table_name"],
                    "from_column": fk["column"],
                    "to_table": fk["references_table"],
                    "to_column": fk["references_column"],
                    "cardinality": "many-to-one",
                    "label": "",
                    "is_auto": True,
                    "is_active": True,
                    "source": "fk",
                }

        # Name-based detection for _id columns without explicit FK
        fk_pairs = {(r["from_table"], r["from_column"]) for r in auto_rules.values()}
        for tbl_entry in tables_out:
            for col_name in tbl_entry["all_columns"]:
                if (tbl_entry["table_name"], col_name) in fk_pairs:
                    continue
                if not col_name.endswith("_id"):
                    continue
                base = col_name[:-3]
                candidates = [base, base + "s", base[:-1] if base.endswith("s") else base + "s"]
                for c in candidates:
                    ref = table_name_map.get(c.lower())
                    if ref and ref["table_name"] != tbl_entry["table_name"]:
                        pk_col = ref["pk_columns"][0] if ref["pk_columns"] else "id"
                        key = (tbl_entry["table_name"], col_name, ref["table_name"], pk_col)
                        if key not in auto_rules:
                            auto_rules[key] = {
                                "id": f"auto-name-{tbl_entry['table_name']}-{col_name}",
                                "from_table": tbl_entry["table_name"],
                                "from_column": col_name,
                                "to_table": ref["table_name"],
                                "to_column": pk_col,
                                "cardinality": "many-to-one",
                                "label": "",
                                "is_auto": True,
                                "is_active": True,
                                "source": "name",
                            }
                        break

        # Fetch persisted user rules
        saved_rules = RelationshipRule.objects.filter(datasource=ds)
        saved_by_key = {
            (r.from_table, r.from_column, r.to_table, r.to_column): r
            for r in saved_rules
        }

        # Merge: saved rules override auto rules
        rules_out = []
        for key, auto_rule in auto_rules.items():
            ft, fc, tt, tc = key
            saved = saved_by_key.get((ft, fc, tt, tc))
            if saved:
                rules_out.append(RelationshipRuleSerializer(saved).data)
            else:
                rules_out.append(auto_rule)

        # Add purely manual rules (no matching auto entry)
        auto_keys = set(auto_rules.keys())
        for key, saved in saved_by_key.items():
            if key not in auto_keys:
                rules_out.append(RelationshipRuleSerializer(saved).data)

        return Response({"tables": tables_out, "rules": rules_out})


class RelationshipRuleViewSet(viewsets.ViewSet):
    """
    CRUD for persisted RelationshipRule records.

    POST   /api/datasources/{id}/relationships/rules/
    PATCH  /api/datasources/{id}/relationships/rules/{rule_id}/
    DELETE /api/datasources/{id}/relationships/rules/{rule_id}/
    """

    def create(self, request, datasource_pk=None):
        ds = DataSource.objects.get(pk=datasource_pk)
        ser = RelationshipRuleSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        rule = ser.save(datasource=ds, is_auto=False, source="manual")
        return Response(RelationshipRuleSerializer(rule).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, datasource_pk=None, rule_id=None):
        rule = RelationshipRule.objects.get(pk=rule_id, datasource_id=datasource_pk)
        ser = RelationshipRuleUpdateSerializer(rule, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(RelationshipRuleSerializer(rule).data)

    def destroy(self, request, datasource_pk=None, rule_id=None):
        rule = RelationshipRule.objects.get(pk=rule_id, datasource_id=datasource_pk)
        rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
