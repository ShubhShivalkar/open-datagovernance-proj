from django.contrib import admin
from .models import DataIsland, DataIslandTable, DataIslandAccess


class DataIslandTableInline(admin.TabularInline):
    model = DataIslandTable
    extra = 0
    fields = ["table_name", "view_name", "time_column", "status", "last_refreshed_at", "last_error"]
    readonly_fields = ["view_name", "status", "last_refreshed_at", "last_error"]


class DataIslandAccessInline(admin.TabularInline):
    model = DataIslandAccess
    extra = 0
    fields = ["email", "name", "role", "granted_by", "granted_at"]
    readonly_fields = ["granted_at"]


@admin.register(DataIsland)
class DataIslandAdmin(admin.ModelAdmin):
    list_display = ["name", "datasource", "status", "refresh_type", "next_run_at", "last_refreshed_at", "created_at"]
    list_filter = ["status", "datasource", "refresh_type", "pii_policy", "refresh_strategy"]
    search_fields = ["name", "description"]
    readonly_fields = ["id", "status", "last_error", "last_refreshed_at", "next_run_at", "created_at", "updated_at"]
    inlines = [DataIslandTableInline, DataIslandAccessInline]
    fieldsets = [
        (None, {"fields": ["id", "name", "description", "datasource"]}),
        ("Refresh Configuration", {"fields": ["refresh_type", "schedule_type", "schedule_value", "next_run_at", "refresh_strategy"]}),
        ("PII Policy", {"fields": ["pii_policy"]}),
        ("Status", {"fields": ["status", "last_error", "last_refreshed_at"]}),
        ("Legacy (Phase 1)", {"fields": ["view_name", "sql_query", "source_tables", "refresh_mode", "refresh_schedule"], "classes": ["collapse"]}),
        ("Timestamps", {"fields": ["created_at", "updated_at"]}),
    ]
