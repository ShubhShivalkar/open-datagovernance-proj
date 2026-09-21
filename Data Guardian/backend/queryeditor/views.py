"""
Query Editor API.

  GET/POST         /api/query-editor/saved/          — list / create saved queries
  GET/PATCH/DELETE /api/query-editor/saved/{id}/     — retrieve / update / delete
  GET              /api/query-editor/tables/         — tables in an environment
  POST             /api/query-editor/run/            — run an ad-hoc read-only query
  POST             /api/query-editor/preview/        — preview the first N rows of a table

All routes are scoped to the caller via the same demo-visibility rules used
across DGP (core.permissions).
"""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import (
    ScopedToOwnerQuerysetMixin,
    demo_object_visible,
)
from core.scheduling import compute_next_run
from datasources.models import DataSource

from .models import QuerySchedule, SavedQuery
from .serializers import (
    PreviewTableSerializer,
    QueryRunSerializer,
    QueryScheduleSerializer,
    RunQuerySerializer,
    SavedQuerySerializer,
    SendResultsEmailSerializer,
)
from .services import (
    QueryValidationError,
    email_query_results,
    list_tables,
    materialize_query,
    parse_recipients,
    preview_table,
    run_due_query_schedules,
    run_query,
    slugify_identifier,
)


def _resolve_datasource(request, datasource):
    """404 (via None) if the caller isn't allowed to see this environment."""
    if not demo_object_visible(request, getattr(datasource, "created_by", None)):
        return None
    return datasource


class SavedQueryViewSet(ScopedToOwnerQuerysetMixin, viewsets.ModelViewSet):
    queryset = SavedQuery.objects.select_related("datasource").all()
    serializer_class = SavedQuerySerializer
    owner_lookup = "datasource__created_by"

    def get_queryset(self):
        qs = super().get_queryset()
        datasource_id = self.request.query_params.get("datasource")
        if datasource_id:
            qs = qs.filter(datasource_id=datasource_id)
        return qs

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(created_by=user)


class QueryScheduleViewSet(ScopedToOwnerQuerysetMixin, viewsets.ModelViewSet):
    """CRUD for query schedules plus run-now / run history / batch run-due."""

    queryset = QuerySchedule.objects.select_related("saved_query", "datasource").all()
    serializer_class = QueryScheduleSerializer
    owner_lookup = "datasource__created_by"

    def get_queryset(self):
        qs = super().get_queryset()
        datasource_id = self.request.query_params.get("datasource")
        saved_query_id = self.request.query_params.get("saved_query")
        if datasource_id:
            qs = qs.filter(datasource_id=datasource_id)
        if saved_query_id:
            qs = qs.filter(saved_query_id=saved_query_id)
        return qs

    def perform_create(self, serializer):
        if hasattr(self.request.user, "demo_session"):
            raise PermissionDenied("Scheduling is not available in demo mode.")
        saved = serializer.validated_data["saved_query"]
        target_table = serializer.validated_data.get("target_table") or slugify_identifier(saved.name)
        if QuerySchedule.objects.filter(
            datasource=saved.datasource, target_schema="schedules", target_table=target_table
        ).exists():
            raise ValidationError(
                {"target_table": f"A schedule already writes to schedules.{target_table} in this environment."}
            )
        user = self.request.user if self.request.user.is_authenticated else None
        schedule = serializer.save(
            datasource=saved.datasource,
            created_by=user,
            target_table=target_table,
        )
        schedule.next_run_at = compute_next_run(schedule.cadence_type, schedule.cadence_value)
        schedule.save(update_fields=["next_run_at", "updated_at"])

    def perform_update(self, serializer):
        schedule = serializer.save()
        schedule.next_run_at = compute_next_run(schedule.cadence_type, schedule.cadence_value)
        schedule.save(update_fields=["next_run_at", "updated_at"])

    @action(detail=True, methods=["post"], url_path="run-now")
    def run_now(self, request, pk=None):
        schedule = self.get_object()
        run = materialize_query(schedule, trigger="manual")
        schedule.refresh_from_db()
        payload = self.get_serializer(schedule).data
        payload["last_run"] = QueryRunSerializer(run).data
        http_status = status.HTTP_200_OK if run.status == "success" else status.HTTP_400_BAD_REQUEST
        return Response(payload, status=http_status)

    @action(detail=True, methods=["get"], url_path="runs")
    def runs(self, request, pk=None):
        schedule = self.get_object()
        qs = schedule.runs.all()
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(QueryRunSerializer(page, many=True).data)
        return Response(QueryRunSerializer(qs, many=True).data)

    @action(detail=False, methods=["post"], url_path="run-due")
    def run_due(self, request):
        results = run_due_query_schedules()
        return Response({"ran": len(results), "results": results})


class ListTablesView(APIView):
    def get(self, request):
        datasource_id = request.query_params.get("datasource")
        if not datasource_id:
            return Response(
                {"detail": "A 'datasource' query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            ds = DataSource.objects.get(pk=datasource_id)
        except (DataSource.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Environment not found."}, status=status.HTTP_404_NOT_FOUND)
        if _resolve_datasource(request, ds) is None:
            return Response({"detail": "Environment not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            tables = list_tables(ds)
        except Exception as exc:  # connector/introspection failure
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"tables": tables, "table_count": len(tables)})


class RunQueryView(APIView):
    def post(self, request):
        ser = RunQuerySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ds = ser.validated_data["datasource"]
        if _resolve_datasource(request, ds) is None:
            return Response({"detail": "Environment not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            result = run_query(ds, ser.validated_data["sql"])
        except QueryValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class PreviewTableView(APIView):
    def post(self, request):
        ser = PreviewTableSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ds = ser.validated_data["datasource"]
        if _resolve_datasource(request, ds) is None:
            return Response({"detail": "Environment not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            result = preview_table(
                ds,
                ser.validated_data["table"],
                ser.validated_data.get("limit"),
            )
        except QueryValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class SendResultsEmailView(APIView):
    """
    Email a saved query's fresh results right now.

    Deliberately NOT blocked in demo mode — a demo visitor can't create a
    persistent schedule, but they can still fire off the results mailer from the
    Schedule dialog.
    """

    def post(self, request):
        ser = SendResultsEmailSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        saved = data.get("saved_query")
        if saved is not None:
            ds, sql, name = saved.datasource, saved.sql_text, saved.name
        else:
            ds, sql, name = data["datasource"], data["sql"], "Ad-hoc query"

        if _resolve_datasource(request, ds) is None:
            return Response({"detail": "Environment not found."}, status=status.HTTP_404_NOT_FOUND)

        recipients = parse_recipients(data["recipients"])
        try:
            result = email_query_results(
                datasource=ds,
                sql=sql,
                query_name=name,
                recipients=recipients,
                message=data.get("message", ""),
            )
        except QueryValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not result["sent"]:
            return Response(
                {"detail": "The mail server rejected the message.", **result},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(result)
