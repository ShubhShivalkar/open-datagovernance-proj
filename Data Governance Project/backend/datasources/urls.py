from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DataSourceViewSet

router = DefaultRouter()
router.register(r"datasources", DataSourceViewSet, basename="datasource")

urlpatterns = [
    path("", include(router.urls)),
]
