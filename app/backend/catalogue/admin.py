from django.contrib import admin
from .models import CatalogueRun, TableCatalogue, ColumnCatalogue


class ColumnInline(admin.TabularInline):
    model = ColumnCatalogue
    extra = 0
    readonly_fields = [
        "column_name", "data_type", "nullable", "is_primary_key",
        "is_foreign_key", "ai_description", "ai_pii_likelihood", "ai_data_category",
    ]
    fields = readonly_fields + ["description", "pii_likelihood", "is_pii_confirmed"]


@admin.register(TableCatalogue)
class TableCatalogueAdmin(admin.ModelAdmin):
    list_display = ["full_name", "datasource", "ai_domain", "row_count_estimate", "updated_at"]
    list_filter = ["datasource", "ai_domain"]
    search_fields = ["full_name", "ai_description", "description"]
    inlines = [ColumnInline]


@admin.register(CatalogueRun)
class CatalogueRunAdmin(admin.ModelAdmin):
    list_display = ["id", "datasource", "status", "tables_processed", "tables_total", "created_at"]
    list_filter = ["status", "datasource"]
    readonly_fields = [f.name for f in CatalogueRun._meta.fields]
