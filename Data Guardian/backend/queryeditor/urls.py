from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ListTablesView,
    PreviewTableView,
    QueryScheduleViewSet,
    RunQueryView,
    SavedQueryViewSet,
    SendResultsEmailView,
)

router = DefaultRouter()
router.register(r"saved", SavedQueryViewSet, basename="saved-query")
router.register(r"schedules", QueryScheduleViewSet, basename="query-schedule")

urlpatterns = [
    path("tables/", ListTablesView.as_view()),
    path("run/", RunQueryView.as_view()),
    path("preview/", PreviewTableView.as_view()),
    path("send-results-email/", SendResultsEmailView.as_view()),
    path("", include(router.urls)),
]
