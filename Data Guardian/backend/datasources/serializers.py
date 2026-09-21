from rest_framework import serializers
from .models import DataSource
from .connectors import SUPPORTED_DB_TYPES

_REQUIRED_CREDENTIALS = {
    "mysql":      ["host", "database", "username"],
    "postgresql": ["host", "database", "username"],
}


class DataSourceSerializer(serializers.ModelSerializer):
    """Read serializer — never exposes raw credentials."""

    host = serializers.SerializerMethodField()

    def get_host(self, obj) -> str:
        try:
            return obj.get_credentials().get("host", "")
        except Exception:  # noqa: BLE001
            return ""

    class Meta:
        model = DataSource
        fields = [
            "id", "name", "description", "db_type", "host",
            "status", "last_tested_at", "last_error",
            "business_context", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "host", "status", "last_tested_at", "last_error", "created_at", "updated_at"]


class DataSourceCreateSerializer(serializers.Serializer):
    """Write serializer — accepts credentials and encrypts them on save."""

    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, default="", allow_blank=True)
    db_type = serializers.ChoiceField(choices=[(t, t) for t in SUPPORTED_DB_TYPES])
    credentials = serializers.DictField(child=serializers.JSONField())
    business_context = serializers.CharField(required=False, default="", allow_blank=True)

    def validate_credentials(self, value):
        db_type = self.initial_data.get("db_type", "")
        for field in _REQUIRED_CREDENTIALS.get(db_type, []):
            if not value.get(field):
                raise serializers.ValidationError(f"'{field}' is required for {db_type}.")
        return value

    def create(self, validated_data):
        credentials = validated_data.pop("credentials")
        ds = DataSource(**validated_data)
        ds.set_credentials(credentials)
        ds.save()
        return ds

    def update(self, instance, validated_data):
        credentials = validated_data.pop("credentials", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if credentials is not None:
            instance.set_credentials(credentials)
        instance.save()
        return instance


class TestConnectionResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    message = serializers.CharField()
