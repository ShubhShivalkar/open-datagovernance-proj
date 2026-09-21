from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import DataSource
from .serializers import (
    DataSourceSerializer,
    DataSourceCreateSerializer,
)
from .connectors import get_connector


class DataSourceViewSet(viewsets.ModelViewSet):
    """
    CRUD + utility actions for DataSource objects.

    list    GET  /api/datasources/
    create  POST /api/datasources/
    retrieve GET /api/datasources/{id}/
    update  PUT  /api/datasources/{id}/
    destroy DELETE /api/datasources/{id}/

    Extra actions:
      POST /api/datasources/{id}/test_connection/
      GET  /api/datasources/{id}/raw_schema/
    """

    queryset = DataSource.objects.all()

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return DataSourceCreateSerializer
        return DataSourceSerializer

    # ------------------------------------------------------------------
    # Standard CRUD overrides
    # ------------------------------------------------------------------

    def create(self, request, *args, **kwargs):
        ser = DataSourceCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        instance = ser.save()

        # Link the adding platform user to the DB credential they used for this env.
        if request.user and request.user.is_authenticated:
            try:
                from iam.services import link_platform_user_to_datasource
                link_platform_user_to_datasource(instance, request.user)
            except Exception:
                pass  # linking is best-effort; never block environment creation

        return Response(
            DataSourceSerializer(instance).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        ser = DataSourceCreateSerializer(instance, data=request.data, partial=partial)
        ser.is_valid(raise_exception=True)
        instance = ser.save()
        return Response(DataSourceSerializer(instance).data)

    # ------------------------------------------------------------------
    # Extra actions
    # ------------------------------------------------------------------

    @action(detail=True, methods=["post"], url_path="test-connection")
    def test_connection(self, request, pk=None):
        """Test the database connection and update the status field."""
        ds = self.get_object()
        try:
            connector = get_connector(ds.db_type, ds.get_credentials())
            success, message = connector.test_connection()
        except Exception as exc:
            success, message = False, str(exc)

        ds.status = "connected" if success else "error"
        ds.last_tested_at = timezone.now()
        ds.last_error = "" if success else message
        ds.save(update_fields=["status", "last_tested_at", "last_error"])

        return Response(
            {"success": success, "message": message},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"], url_path="raw-schema")
    def raw_schema(self, request, pk=None):
        """
        Return the raw introspected schema from the database.
        Useful for debugging and previewing before catalogue generation.
        """
        ds = self.get_object()
        try:
            connector = get_connector(ds.db_type, ds.get_credentials())
            schema = connector.get_schema()
            return Response({"table_count": len(schema), "schema": schema})
        except Exception as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
