from django.contrib.auth import authenticate, login, logout, get_user_model
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DatabaseUser
from .serializers import AppUserSerializer, AppUserCreateSerializer

User = get_user_model()


@method_decorator(csrf_exempt, name="dispatch")
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username", "").strip()
        password = request.data.get("password", "")
        if not username or not password:
            return Response({"detail": "Username and password are required."}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request, username=username, password=password)
        if not user or not user.is_active:
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)

        login(request, user)
        csrf_token = get_token(request)
        response = Response(AppUserSerializer(user).data)
        response["X-CSRFToken"] = csrf_token
        return response


@method_decorator(csrf_exempt, name="dispatch")
class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out."})


class MeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({"detail": "Not authenticated."}, status=status.HTTP_401_UNAUTHORIZED)
        response = Response(AppUserSerializer(request.user).data)
        response["X-CSRFToken"] = get_token(request)
        return response


class AppUserListCreateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        users = User.objects.prefetch_related("db_users__datasource").order_by("-date_joined")
        return Response(AppUserSerializer(users, many=True).data)

    def post(self, request):
        ser = AppUserCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        if User.objects.filter(username=d["username"]).exists():
            return Response({"detail": "Username already exists."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(
            username=d["username"],
            password=d["password"],
            email=d.get("email", ""),
            first_name=d.get("first_name", ""),
            last_name=d.get("last_name", ""),
            is_staff=d.get("is_staff", False),
            is_superuser=d.get("is_superuser", False),
        )

        return Response(AppUserSerializer(user).data, status=status.HTTP_201_CREATED)


class AppUserDetailView(APIView):
    permission_classes = [AllowAny]

    def _get_user(self, pk):
        try:
            return User.objects.prefetch_related("db_users__datasource").get(pk=pk)
        except User.DoesNotExist:
            return None

    def get(self, request, pk):
        user = self._get_user(pk)
        if not user:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AppUserSerializer(user).data)

    def delete(self, request, pk):
        user = self._get_user(pk)
        if not user:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if user == request.user:
            return Response({"detail": "Cannot delete your own account."}, status=status.HTTP_400_BAD_REQUEST)
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk):
        user = self._get_user(pk)
        if not user:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        allowed = {"email", "first_name", "last_name", "is_staff", "is_superuser", "is_active"}
        for field, value in request.data.items():
            if field in allowed:
                setattr(user, field, value)
        if "password" in request.data:
            user.set_password(request.data["password"])
        user.save()

        return Response(AppUserSerializer(user).data)
