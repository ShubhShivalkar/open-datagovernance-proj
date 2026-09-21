from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DataIslandViewSet

router = DefaultRouter()
router.register(r"data-islands", DataIslandViewSet, basename="data-island")

urlpatterns = [
    path("", include(router.urls)),
]
