from django.urls import path
from . import views

urlpatterns = [
    # Full Erasure
    path("erasure/requests/", views.ErasureRequestListCreateView.as_view()),
    path("erasure/requests/<uuid:pk>/", views.ErasureRequestDetailView.as_view()),
    path("erasure/requests/<uuid:pk>/plan/", views.trigger_plan),
    path("erasure/requests/<uuid:pk>/approve/", views.approve_request),
    path("erasure/requests/<uuid:pk>/execute/", views.execute_request),
    path("erasure/requests/<uuid:pk>/cancel/", views.cancel_request),
    path("erasure/audit-log/", views.AuditLogListView.as_view()),

    # Data Access Request (DSAR)
    path("access/requests/", views.AccessRequestListCreateView.as_view()),
    path("access/requests/<uuid:pk>/", views.AccessRequestDetailView.as_view()),
    path("access/requests/<uuid:pk>/discover/", views.trigger_discovery),
    path("access/requests/<uuid:pk>/report/", views.get_access_report),
    path("access/requests/<uuid:pk>/send-report/", views.send_access_report),
    path("access/requests/<uuid:pk>/export/", views.export_access_xlsx),
    path("access/requests/<uuid:pk>/cancel/", views.cancel_access_request),
]
