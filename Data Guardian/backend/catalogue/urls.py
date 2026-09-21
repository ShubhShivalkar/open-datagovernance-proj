from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CatalogueRunViewSet,
    TableCatalogueViewSet,
    ColumnCatalogueViewSet,
    DataSourceCatalogueActionViewSet,
    RelationshipRuleViewSet,
)

router = DefaultRouter()
router.register(r"catalogue/runs", CatalogueRunViewSet, basename="catalogue-run")
router.register(r"catalogue/tables", TableCatalogueViewSet, basename="catalogue-table")
router.register(r"catalogue/columns", ColumnCatalogueViewSet, basename="catalogue-column")

ds_actions = DataSourceCatalogueActionViewSet.as_view({"post": "generate", "get": "latest"})
ds_relationships = DataSourceCatalogueActionViewSet.as_view({"get": "relationships"})
rule_list = RelationshipRuleViewSet.as_view({"post": "create"})
rule_detail = RelationshipRuleViewSet.as_view({"patch": "partial_update", "delete": "destroy"})

urlpatterns = [
    path("", include(router.urls)),
    # Catalogue actions nested under datasources:
    path("datasources/<str:datasource_pk>/generate-catalogue/", ds_actions),
    path("datasources/<str:datasource_pk>/latest-catalogue/", ds_actions),
    path("datasources/<str:datasource_pk>/relationships/", ds_relationships),
    path("datasources/<str:datasource_pk>/relationships/rules/", rule_list),
    path("datasources/<str:datasource_pk>/relationships/rules/<str:rule_id>/", rule_detail),
]
