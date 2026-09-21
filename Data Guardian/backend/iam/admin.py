from django.contrib import admin
from .models import DatabaseUser, AccessGroup


@admin.register(DatabaseUser)
class DatabaseUserAdmin(admin.ModelAdmin):
    list_display = ["name", "email", "username", "datasource", "is_platform_user", "platform_role", "status", "created_at"]
    list_filter = ["status", "is_platform_user", "platform_role", "datasource"]
    search_fields = ["name", "email", "username"]
    readonly_fields = ["id", "created_at", "updated_at"]


@admin.register(AccessGroup)
class AccessGroupAdmin(admin.ModelAdmin):
    list_display = ["name", "member_count", "island_count", "created_at"]
    search_fields = ["name", "description"]
    readonly_fields = ["id", "created_at", "updated_at"]
    filter_horizontal = ["members", "data_islands"]

    def member_count(self, obj):
        return obj.members.count()

    def island_count(self, obj):
        return obj.data_islands.count()
