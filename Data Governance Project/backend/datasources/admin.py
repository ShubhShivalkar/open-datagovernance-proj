from django.contrib import admin
from .models import DataSource


@admin.register(DataSource)
class DataSourceAdmin(admin.ModelAdmin):
    list_display = ["name", "db_type", "status", "last_tested_at", "created_at"]
    list_filter = ["db_type", "status"]
    search_fields = ["name", "description"]
    readonly_fields = ["id", "status", "last_tested_at", "last_error", "created_at", "updated_at"]
    exclude = ["_credentials_encrypted"]  # Never show raw encrypted bytes in admin
