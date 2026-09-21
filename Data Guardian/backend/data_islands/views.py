"""
Data Islands views.

DataIslandViewSet provides full CRUD plus extra actions:
  POST   /{id}/refresh/              — re-run all per-table VIEWs
  GET    /{id}/access/               — list access grants
  POST   /{id}/access/               — add an access grant
  DELETE /{id}/access/{access_id}/   — remove a specific access grant
  POST   /run-due/                   — run all scheduled islands past their next_run_at
"""

from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import DataIsland, DataIslandAccess
from .serializers import (
    DataIslandListSerializer,
    DataIslandDetailSerializer,
    DataIslandCreateSerializer,
    DataIslandAccessSerializer,
    DataIslandRefreshResponseSerializer,
)
from .services import (
    create_island,
    refresh_island,
    delete_island_view,
    get_pii_columns_for_table,
)


class DataIslandViewSet(viewsets.ModelViewSet):
    queryset = DataIsland.objects.select_related("datasource").prefetch_related(
        "island_tables", "access_grants"
    ).all()

    def get_serializer_class(self):
        if self.action == "list":
            return DataIslandListSerializer
        if self.action in ("create", "update", "partial_update"):
            return DataIslandCreateSerializer
        return DataIslandDetailSerializer

    # ── CRUD overrides ────────────────────────────────────────────────────────

    def create(self, request, *args, **kwargs):
        ser = DataIslandCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        ds = d["datasource"]

        # Enrich each table_config with PII column info from the catalogue
        table_configs_with_pii = []
        for tc in d["table_configs"]:
            columns = get_pii_columns_for_table(str(ds.id), tc["table_name"])
            table_configs_with_pii.append({
                "table_name": tc["table_name"],
                "time_column": tc.get("time_column", ""),
                "columns": columns,
            })

        try:
            island = create_island(
                datasource_id=str(ds.id),
                name=d["name"],
                description=d.get("description", ""),
                refresh_type=d.get("refresh_type", "static"),
                schedule_type=d.get("schedule_type", "cron"),
                schedule_value=d.get("schedule_value", ""),
                pii_policy=d.get("pii_policy", "allow"),
                refresh_strategy=d.get("refresh_strategy", "full"),
                table_configs=table_configs_with_pii,
            )
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        island.refresh_from_db()
        return Response(
            DataIslandDetailSerializer(island).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        """Update metadata fields only — does NOT re-run DDL."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        # Allow partial metadata updates via PATCH without requiring table_configs
        allowed_fields = {"name", "description", "refresh_type", "schedule_type",
                          "schedule_value", "pii_policy", "refresh_strategy"}
        data = {k: v for k, v in request.data.items() if k in allowed_fields}
        for field, value in data.items():
            setattr(instance, field, value)
        instance.save()
        return Response(DataIslandDetailSerializer(instance).data)

    def destroy(self, request, *args, **kwargs):
        island = self.get_object()
        delete_island_view(str(island.id))
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ── Extra actions ─────────────────────────────────────────────────────────

    @action(detail=True, methods=["post"], url_path="refresh")
    def refresh(self, request, pk=None):
        """Re-run CREATE OR REPLACE VIEW for all tables in this island."""
        island = self.get_object()
        try:
            island = refresh_island(str(island.id))
            payload = {
                "success": True,
                "status": island.status,
                "last_refreshed_at": island.last_refreshed_at,
                "message": "All views refreshed successfully.",
            }
            return Response(DataIslandRefreshResponseSerializer(payload).data)
        except RuntimeError as exc:
            island.refresh_from_db()
            payload = {
                "success": False,
                "status": island.status,
                "last_refreshed_at": island.last_refreshed_at,
                "message": str(exc),
            }
            return Response(
                DataIslandRefreshResponseSerializer(payload).data,
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=False, methods=["post"], url_path="run-due")
    def run_due(self, request):
        """Find all scheduled islands past their next_run_at and refresh them."""
        now = timezone.now()
        due_islands = DataIsland.objects.filter(
            refresh_type="scheduled",
            next_run_at__lte=now,
        ).select_related("datasource")

        results = []
        for island in due_islands:
            try:
                refresh_island(str(island.id))
                results.append({"id": str(island.id), "name": island.name, "success": True})
            except RuntimeError as exc:
                results.append({"id": str(island.id), "name": island.name, "success": False, "error": str(exc)})

        return Response({"ran": len(results), "results": results})

    @action(detail=True, methods=["get", "post"], url_path="access")
    def access(self, request, pk=None):
        island = self.get_object()
        if request.method == "GET":
            return Response(DataIslandAccessSerializer(island.access_grants.all(), many=True).data)
        ser = DataIslandAccessSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        grant = DataIslandAccess.objects.create(island=island, **ser.validated_data)
        return Response(DataIslandAccessSerializer(grant).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"access/(?P<access_id>[^/.]+)")
    def remove_access(self, request, pk=None, access_id=None):
        island = self.get_object()
        try:
            island.access_grants.get(id=access_id).delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except DataIslandAccess.DoesNotExist:
            return Response({"detail": "Access grant not found."}, status=status.HTTP_404_NOT_FOUND)
