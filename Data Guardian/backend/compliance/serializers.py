from rest_framework import serializers
from .models import ErasureRequest, ErasurePlan, ErasureApproval, ErasureAuditLog, AccessRequest, AccessDiscovery


class ErasurePlanSerializer(serializers.ModelSerializer):
    # JSONTextField is a TextField subclass; DRF would auto-map it to CharField
    # (giving Python repr strings). Explicit JSONField ensures a real JSON array.
    plan_data = serializers.JSONField()

    class Meta:
        model = ErasurePlan
        fields = ["id", "plan_data", "total_rows", "created_at"]


class ErasureApprovalSerializer(serializers.ModelSerializer):
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)

    class Meta:
        model = ErasureApproval
        fields = ["id", "approved_by_username", "approved_at"]


class ErasureRequestSerializer(serializers.ModelSerializer):
    datasource_name = serializers.CharField(source="datasource.name", read_only=True)
    requested_by_username = serializers.CharField(source="requested_by.username", read_only=True)
    input_resolved = serializers.JSONField(read_only=True)

    class Meta:
        model = ErasureRequest
        fields = [
            "id", "datasource", "datasource_name",
            "data_principal_id", "identifier_table", "identifier_column",
            "input_type", "input_raw", "input_resolved",
            "reason", "status", "requested_by_username",
            "error_message", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "error_message", "created_at", "updated_at"]


class ErasureRequestDetailSerializer(ErasureRequestSerializer):
    plan = ErasurePlanSerializer(read_only=True)
    approval = ErasureApprovalSerializer(read_only=True)

    class Meta(ErasureRequestSerializer.Meta):
        fields = ErasureRequestSerializer.Meta.fields + ["plan", "approval"]


class ErasureAuditLogSerializer(serializers.ModelSerializer):
    identifier_values = serializers.JSONField(read_only=True)
    tables_affected   = serializers.JSONField(read_only=True)

    class Meta:
        model = ErasureAuditLog
        fields = [
            "id", "request_id", "data_principal_id", "identifier_field",
            "identifier_values", "tables_affected", "rows_deleted",
            "approver_identity", "approved_at", "executed_at", "created_at",
        ]


# ---------------------------------------------------------------------------
# Data Access Request serializers
# ---------------------------------------------------------------------------

class AccessDiscoverySerializer(serializers.ModelSerializer):
    discovery_data = serializers.JSONField()

    class Meta:
        model = AccessDiscovery
        fields = ["id", "discovery_data", "total_rows", "created_at"]


class AccessRequestSerializer(serializers.ModelSerializer):
    datasource_name          = serializers.CharField(source="datasource.name", read_only=True)
    requested_by_username    = serializers.CharField(source="requested_by.username", read_only=True)
    additional_emails        = serializers.JSONField()

    class Meta:
        model = AccessRequest
        fields = [
            "id", "datasource", "datasource_name",
            "subject_id", "subject_email", "additional_emails",
            "identifier_table", "identifier_column",
            "status", "requested_by_username",
            "error_message", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "error_message", "created_at", "updated_at"]


class AccessRequestDetailSerializer(AccessRequestSerializer):
    discovery = AccessDiscoverySerializer(read_only=True)

    class Meta(AccessRequestSerializer.Meta):
        fields = AccessRequestSerializer.Meta.fields + ["discovery"]
