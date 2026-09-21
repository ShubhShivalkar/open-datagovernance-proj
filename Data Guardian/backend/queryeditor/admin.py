from django.contrib import admin

from .models import QueryRun, QuerySchedule, SavedQuery


@admin.register(SavedQuery)
class SavedQueryAdmin(admin.ModelAdmin):
    list_display = ("name", "datasource", "created_by", "updated_at")
    search_fields = ("name", "sql_text")
    list_filter = ("datasource",)
    readonly_fields = ("created_at", "updated_at")


class QueryRunInline(admin.TabularInline):
    model = QueryRun
    extra = 0
    can_delete = False
    readonly_fields = (
        "status", "write_mode", "target", "row_count",
        "elapsed_ms", "error_message", "trigger", "email_status", "started_at",
    )
    ordering = ("-started_at",)


@admin.register(QuerySchedule)
class QueryScheduleAdmin(admin.ModelAdmin):
    list_display = (
        "saved_query", "datasource", "cadence_type", "cadence_value",
        "write_mode", "target_table", "is_active", "next_run_at", "last_status",
    )
    list_filter = ("is_active", "cadence_type", "write_mode", "datasource")
    search_fields = ("saved_query__name", "target_table")
    readonly_fields = (
        "next_run_at", "last_run_at", "last_status", "last_error",
        "last_row_count", "created_at", "updated_at",
    )
    inlines = [QueryRunInline]
