from rest_framework import serializers
from datasources.models import DataSource
from .models import DataIsland, DataIslandTable, DataIslandAccess


class DataIslandAccessSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataIslandAccess
        fields = ["id", "email", "name", "role", "granted_at", "granted_by"]
        read_only_fields = ["id", "granted_at"]


class DataIslandTableSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataIslandTable
        fields = [
            "id", "table_name", "view_name", "sql_query", "time_column",
            "status", "last_error", "last_refreshed_at", "created_at", "updated_at",
        ]
        read_only_fields = fields


class DataIslandListSerializer(serializers.ModelSerializer):
    datasource_name = serializers.SerializerMethodField()
    view_count = serializers.SerializerMethodField()
    access_count = serializers.SerializerMethodField()

    class Meta:
        model = DataIsland
        fields = [
            "id", "name", "description",
            "datasource", "datasource_name",
            "view_count", "access_count",
            "status", "last_refreshed_at",
            "refresh_type", "schedule_type", "schedule_value", "next_run_at",
            "pii_policy", "refresh_strategy",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_datasource_name(self, obj) -> str:
        return obj.datasource.name

    def get_view_count(self, obj) -> int:
        return obj.island_tables.count()

    def get_access_count(self, obj) -> int:
        return obj.access_grants.count()


class DataIslandDetailSerializer(serializers.ModelSerializer):
    datasource_name = serializers.SerializerMethodField()
    view_count = serializers.SerializerMethodField()
    access_count = serializers.SerializerMethodField()
    island_tables = DataIslandTableSerializer(many=True, read_only=True)
    access_grants = DataIslandAccessSerializer(many=True, read_only=True)

    class Meta:
        model = DataIsland
        fields = [
            "id", "name", "description",
            "datasource", "datasource_name",
            "view_count", "access_count",
            "island_tables", "access_grants",
            "status", "last_error", "last_refreshed_at",
            "refresh_type", "schedule_type", "schedule_value", "next_run_at",
            "pii_policy", "refresh_strategy",
            # Legacy fields (Phase 1 backward compat)
            "view_name", "sql_query", "source_tables",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_datasource_name(self, obj) -> str:
        return obj.datasource.name

    def get_view_count(self, obj) -> int:
        return obj.island_tables.count()

    def get_access_count(self, obj) -> int:
        return obj.access_grants.count()


class TableConfigInputSerializer(serializers.Serializer):
    table_name = serializers.CharField()
    time_column = serializers.CharField(required=False, allow_blank=True, default="")


class DataIslandCreateSerializer(serializers.Serializer):
    name = serializers.CharField()
    description = serializers.CharField(required=False, allow_blank=True, default="")
    datasource = serializers.PrimaryKeyRelatedField(queryset=DataSource.objects.all())
    refresh_type = serializers.ChoiceField(choices=["static", "scheduled"], default="static")
    schedule_type = serializers.ChoiceField(choices=["cron", "frequency"], required=False, default="cron")
    schedule_value = serializers.CharField(required=False, allow_blank=True, default="")
    pii_policy = serializers.ChoiceField(choices=["allow", "hide", "encrypt"], default="allow")
    refresh_strategy = serializers.ChoiceField(choices=["full", "incremental"], default="full")
    table_configs = TableConfigInputSerializer(many=True)

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Island name cannot be blank.")
        return value

    def validate(self, data):
        if data.get("refresh_type") == "scheduled" and not data.get("schedule_value", "").strip():
            raise serializers.ValidationError(
                {"schedule_value": "schedule_value is required when refresh_type is 'scheduled'."}
            )
        if data.get("refresh_strategy") == "incremental":
            if not any(tc.get("time_column") for tc in data.get("table_configs", [])):
                raise serializers.ValidationError(
                    {"table_configs": "At least one table must have a time_column for incremental refresh."}
                )
        if not data.get("table_configs"):
            raise serializers.ValidationError({"table_configs": "At least one table must be selected."})
        return data


class DataIslandRefreshResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    status = serializers.CharField()
    last_refreshed_at = serializers.DateTimeField(allow_null=True)
    message = serializers.CharField()
