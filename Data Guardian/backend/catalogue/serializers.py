from rest_framework import serializers
from .models import CatalogueRun, TableCatalogue, ColumnCatalogue, RelationshipRule


class ColumnCatalogueSerializer(serializers.ModelSerializer):
    effective_description = serializers.ReadOnlyField()
    effective_business_name = serializers.ReadOnlyField()
    effective_pii_likelihood = serializers.ReadOnlyField()
    effective_data_category = serializers.ReadOnlyField()

    class Meta:
        model = ColumnCatalogue
        fields = [
            "id",
            "column_name",
            "data_type",
            "nullable",
            "is_primary_key",
            "is_foreign_key",
            "foreign_key_references",
            "default_value",
            "max_length",
            "native_comment",
            # AI-generated
            "ai_description",
            "ai_business_name",
            "ai_data_category",
            "ai_pii_likelihood",
            # Human overrides
            "description",
            "business_name",
            "data_category",
            "pii_likelihood",
            "is_pii_confirmed",
            # Effective (AI or human)
            "effective_description",
            "effective_business_name",
            "effective_pii_likelihood",
            "effective_data_category",
            "ordinal_position",
            "updated_at",
        ]
        read_only_fields = [
            "id", "column_name", "data_type", "nullable", "is_primary_key",
            "is_foreign_key", "foreign_key_references", "default_value", "max_length",
            "native_comment", "ai_description", "ai_business_name",
            "ai_data_category", "ai_pii_likelihood", "ordinal_position", "updated_at",
        ]


class ColumnCatalogueUpdateSerializer(serializers.ModelSerializer):
    """Allows human overrides only."""

    class Meta:
        model = ColumnCatalogue
        fields = [
            "description",
            "business_name",
            "data_category",
            "pii_likelihood",
            "is_pii_confirmed",
        ]


class TableCatalogueSerializer(serializers.ModelSerializer):
    columns = ColumnCatalogueSerializer(many=True, read_only=True)
    effective_description = serializers.ReadOnlyField()
    effective_business_purpose = serializers.ReadOnlyField()
    effective_domain = serializers.ReadOnlyField()
    column_count = serializers.SerializerMethodField()
    pii_column_count = serializers.SerializerMethodField()

    class Meta:
        model = TableCatalogue
        fields = [
            "id",
            "schema_name",
            "table_name",
            "full_name",
            "ai_description",
            "ai_business_purpose",
            "ai_domain",
            "description",
            "business_purpose",
            "domain",
            "tags",
            "row_count_estimate",
            "effective_description",
            "effective_business_purpose",
            "effective_domain",
            "column_count",
            "pii_column_count",
            "columns",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "schema_name", "table_name", "full_name",
            "ai_description", "ai_business_purpose", "ai_domain",
            "row_count_estimate", "created_at", "updated_at",
        ]

    def get_column_count(self, obj) -> int:
        return obj.columns.count()

    def get_pii_column_count(self, obj) -> int:
        return obj.columns.filter(
            ai_pii_likelihood__in=["medium", "high"]
        ).count()


class TableCatalogueListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the table list — no nested columns."""
    effective_description = serializers.ReadOnlyField()
    effective_domain = serializers.ReadOnlyField()
    column_count = serializers.SerializerMethodField()
    pii_column_count = serializers.SerializerMethodField()

    class Meta:
        model = TableCatalogue
        fields = [
            "id", "schema_name", "table_name", "full_name",
            "effective_description", "effective_domain", "tags",
            "row_count_estimate", "column_count", "pii_column_count",
            "is_verified", "verified_by", "verified_at",
            "updated_at",
        ]

    def get_column_count(self, obj) -> int:
        return obj.columns.count()

    def get_pii_column_count(self, obj) -> int:
        return obj.columns.filter(ai_pii_likelihood__in=["medium", "high"]).count()


class TableCatalogueUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TableCatalogue
        fields = ["description", "business_purpose", "domain", "tags", "is_verified", "verified_by"]


class CatalogueRunSerializer(serializers.ModelSerializer):
    progress_pct = serializers.ReadOnlyField()

    class Meta:
        model = CatalogueRun
        fields = [
            "id",
            "datasource",
            "status",
            "ai_provider",
            "ai_model",
            "error_message",
            "tables_processed",
            "tables_total",
            "progress_pct",
            "started_at",
            "completed_at",
            "created_at",
        ]
        read_only_fields = fields


class RelationshipRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = RelationshipRule
        fields = [
            "id", "from_table", "from_column", "to_table", "to_column",
            "cardinality", "label", "is_auto", "is_active", "source",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "is_auto", "source", "created_at", "updated_at"]


class RelationshipRuleUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RelationshipRule
        fields = ["from_table", "from_column", "to_table", "to_column", "cardinality", "label", "is_active"]


class GenerateCatalogueRequestSerializer(serializers.Serializer):
    ai_provider = serializers.CharField(required=False, default="")
    ai_api_key = serializers.CharField(required=False, default="", allow_blank=True)
    ai_model = serializers.CharField(required=False, default="", allow_blank=True)
    refresh_mode = serializers.ChoiceField(
        choices=["incremental", "full"],
        default="incremental",
        required=False,
        help_text=(
            "incremental: only process newly added tables/columns, preserving existing definitions. "
            "full: wipe all previously generated definitions and regenerate from scratch."
        ),
    )
