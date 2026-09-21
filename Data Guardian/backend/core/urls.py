from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("datasources.urls")),
    path("api/", include("catalogue.urls")),
    path("api/", include("data_islands.urls")),
    path("api/", include("iam.urls")),
    path("api/", include("iam.auth_urls")),
    path("api/compliance/", include("compliance.urls")),
    path("api/query-editor/", include("queryeditor.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
