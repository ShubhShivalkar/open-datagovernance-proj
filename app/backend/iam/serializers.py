from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import DatabaseUser, AccessGroup, UserProfile

User = get_user_model()


class DatabaseUserSerializer(serializers.ModelSerializer):
    datasource_name = serializers.SerializerMethodField()
    group_count = serializers.SerializerMethodField()

    class Meta:
        model = DatabaseUser
        fields = [
            "id", "name", "email", "username",
            "datasource", "datasource_name",
            "is_platform_user", "platform_role",
            "status", "notes",
            "group_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "datasource_name", "group_count"]

    def get_datasource_name(self, obj) -> str | None:
        return obj.datasource.name if obj.datasource else None

    def get_group_count(self, obj) -> int:
        return obj.access_groups.count()

    def validate(self, data):
        if data.get("is_platform_user") and not data.get("platform_role"):
            raise serializers.ValidationError(
                {"platform_role": "platform_role is required when is_platform_user is true."}
            )
        if not data.get("is_platform_user"):
            data["platform_role"] = ""
        return data


class AccessGroupMemberSerializer(serializers.ModelSerializer):
    datasource_name = serializers.SerializerMethodField()

    class Meta:
        model = DatabaseUser
        fields = ["id", "name", "email", "username", "datasource_name",
                  "is_platform_user", "platform_role", "status"]

    def get_datasource_name(self, obj) -> str | None:
        return obj.datasource.name if obj.datasource else None


class AccessGroupIslandSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    status = serializers.CharField()
    datasource_name = serializers.SerializerMethodField()

    def get_datasource_name(self, obj) -> str:
        return obj.datasource.name if obj.datasource else ""


class AccessGroupListSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    island_count = serializers.SerializerMethodField()

    class Meta:
        model = AccessGroup
        fields = [
            "id", "name", "description",
            "member_count", "island_count",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_member_count(self, obj) -> int:
        return obj.members.count()

    def get_island_count(self, obj) -> int:
        return obj.data_islands.count()


class AccessGroupDetailSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    island_count = serializers.SerializerMethodField()
    members = AccessGroupMemberSerializer(many=True, read_only=True)
    data_islands = AccessGroupIslandSerializer(many=True, read_only=True)

    class Meta:
        model = AccessGroup
        fields = [
            "id", "name", "description",
            "member_count", "island_count",
            "members", "data_islands",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_member_count(self, obj) -> int:
        return obj.members.count()

    def get_island_count(self, obj) -> int:
        return obj.data_islands.count()


class AccessGroupCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccessGroup
        fields = ["id", "name", "description", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class AppUserDbLinkSerializer(serializers.Serializer):
    """Compact representation of one DB user linked to a platform user."""
    id = serializers.UUIDField()
    username = serializers.CharField()
    datasource_name = serializers.SerializerMethodField()

    def get_datasource_name(self, obj) -> str | None:
        return obj.datasource.name if obj.datasource_id else None


class AppUserSerializer(serializers.ModelSerializer):
    db_users = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "is_staff", "is_superuser", "is_active", "date_joined",
            "db_users",
        ]
        read_only_fields = fields

    def get_db_users(self, obj) -> list:
        qs = obj.db_users.select_related("datasource").all()
        return AppUserDbLinkSerializer(qs, many=True).data


class AppUserCreateSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    first_name = serializers.CharField(required=False, allow_blank=True, default="")
    last_name = serializers.CharField(required=False, allow_blank=True, default="")
    is_staff = serializers.BooleanField(default=False)
    is_superuser = serializers.BooleanField(default=False)
