from django.urls import path
from .auth_views import LoginView, LogoutView, MeView, AppUserListCreateView, AppUserDetailView

urlpatterns = [
    path("auth/login/",       LoginView.as_view()),
    path("auth/logout/",      LogoutView.as_view()),
    path("auth/me/",          MeView.as_view()),
    path("auth/users/",       AppUserListCreateView.as_view()),
    path("auth/users/<int:pk>/", AppUserDetailView.as_view()),
]
