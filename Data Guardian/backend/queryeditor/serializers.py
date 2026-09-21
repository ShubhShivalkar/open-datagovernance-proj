import json
import re

from rest_framework import serializers

from core.scheduling import compute_next_run
from datasources.models import DataSource

from .models import QueryRun, QuerySchedule, SavedQuery
from .services import parse_recipients


class SavedQuerySerializer(serializers.ModelSerializer):
    datasource = serializers.PrimaryKeyRelatedField(queryset=DataSource.objects.all())
    datasource_name = serializers.CharField(source="datasource.name", read_only=True)

    class Meta:
        model = SavedQuery
        fields = [
            "id", "name", "sql_text",
            "datasource", "datasource_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "datasource_name", "created_at", "updated_at"]

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Query name cannot be blank.")
        return value


class RunQuerySerializer(serializers.Serializer):
    datasource = serializers.PrimaryKeyRelatedField(queryset=DataSource.objects.all())
    sql = serializers.CharField()


class PreviewTableSerializer(serializers.Serializer):
    datasource = serializers.PrimaryKeyRelatedField(queryset=DataSource.objects.all())
    table = serializers.CharField()
    limit = serializers.IntegerField(required=False, min_value=1, max_value=500)


class QueryRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = QueryRun
        fields = [
            "id", "status", "write_mode", "target", "row_count",
            "elapsed_ms", "error_message", "trigger", "email_status", "started_at",
        ]
        read_only_fields = fields


class QueryScheduleSerializer(serializers.ModelSerializer):
    saved_query = serializers.PrimaryKeyRelatedField(queryset=SavedQuery.objects.all())
    saved_query_name = serializers.CharField(source="saved_query.name", read_only=True)
    datasource = serializers.PrimaryKeyRelatedField(read_only=True)
    datasource_name = serializers.CharField(source="datasource.name", read_only=True)
    cadence_display = serializers.SerializerMethodField()

    class Meta:
        model = QuerySchedule
        fields = [
            "id",
            "saved_query", "saved_query_name",
            "datasource", "datasource_name",
            "cadence_type", "cadence_value", "cadence_display",
            "write_mode", "target_schema", "target_table",
            "is_active",
            "email_enabled", "email_recipients", "email_message",
            "next_run_at", "last_run_at", "last_status", "last_error", "last_row_count",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "saved_query_name", "datasource", "datasource_name", "cadence_display",
            "target_schema", "next_run_at", "last_run_at", "last_status",
            "last_error", "last_row_count", "created_at", "updated_at",
        ]
        extra_kwargs = {
            "target_table": {"required": False},
            "email_recipients": {"required": False},
            "email_message": {"required": False},
        }

    def get_cadence_display(self, obj) -> str:
        if obj.cadence_type == "frequency":
            try:
                cfg = json.loads(obj.cadence_value)
                return f"Every {cfg.get('every', 1)} {cfg.get('unit', 'hours')}"
            except (ValueError, TypeError):
                return obj.cadence_value
        return obj.cadence_value

    def validate_target_table(self, value):
        cleaned = re.sub(r"[^a-z0-9_]+", "_", (value or "").lower()).strip("_")
        if not cleaned:
            raise serializers.ValidationError("Enter a valid table name (letters, digits, underscores).")
        return cleaned[:128]

    def validate(self, data):
        cadence_type = data.get("cadence_type") or getattr(self.instance, "cadence_type", "frequency")
        cadence_value = data.get("cadence_value") or getattr(self.instance, "cadence_value", "")
        if compute_next_run(cadence_type, cadence_value) is None:
            raise serializers.ValidationError(
                {"cadence_value": "Could not parse this schedule expression."}
            )

        email_enabled = data.get("email_enabled")
        if email_enabled is None:
            email_enabled = getattr(self.instance, "email_enabled", False)
        if email_enabled:
            raw = data.get("email_recipients")
            if raw is None:
                raw = getattr(self.instance, "email_recipients", "")
            if not parse_recipients(raw):
                raise serializers.ValidationError(
                    {"email_recipients": "Add at least one valid email address to enable the mailer."}
                )
        return data


class SendResultsEmailSerializer(serializers.Serializer):
    """Ad-hoc 'email these results now' — usable without a saved schedule (demo-friendly)."""

    saved_query = serializers.PrimaryKeyRelatedField(
        queryset=SavedQuery.objects.all(), required=False
    )
    datasource = serializers.PrimaryKeyRelatedField(
        queryset=DataSource.objects.all(), required=False
    )
    sql = serializers.CharField(required=False)
    recipients = serializers.CharField()
    message = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        if not data.get("saved_query") and not (data.get("datasource") and data.get("sql")):
            raise serializers.ValidationError(
                "Provide 'saved_query', or both 'datasource' and 'sql'."
            )
        if not parse_recipients(data.get("recipients", "")):
            raise serializers.ValidationError(
                {"recipients": "Enter at least one valid email address."}
            )
        return data
