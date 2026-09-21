from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DatabaseUserViewSet, AccessGroupViewSet

router = DefaultRouter()
router.register(r"iam/users", DatabaseUserViewSet, basename="iam-user")
router.register(r"iam/groups", AccessGroupViewSet, basename="iam-group")

urlpatterns = [
    path("", include(router.urls)),
]
