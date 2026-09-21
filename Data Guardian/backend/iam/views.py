import secrets
import logging

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from core.email import send_db_credentials
from .models import DatabaseUser, AccessGroup
from .services import sync_db_users, create_user_in_db

logger = logging.getLogger(__name__)
from .serializers import (
    DatabaseUserSerializer,
    AccessGroupListSerializer,
    AccessGroupDetailSerializer,
    AccessGroupCreateSerializer,
)
from data_islands.models import DataIsland


class DatabaseUserViewSet(viewsets.ModelViewSet):
    queryset = DatabaseUser.objects.select_related("datasource").prefetch_related("access_groups").all()
    serializer_class = DatabaseUserSerializer

    @action(detail=False, methods=["post"], url_path="create-in-db")
    def create_in_db(self, request):
        """
        Create a real DB user in a connected environment, then register them in DGP.
        A secure password is generated server-side and emailed to the user's address.
        Body: { datasource_id, username, email, privilege_level, name?, notes? }
        """
        required = ["datasource_id", "username", "email", "privilege_level"]
        for field in required:
            if not request.data.get(field):
                return Response({"detail": f"'{field}' is required."}, status=status.HTTP_400_BAD_REQUEST)

        email = request.data["email"].strip()
        generated_password = secrets.token_urlsafe(16)

        platform_user = request.user if request.user.is_authenticated else None
        try:
            db_user = create_user_in_db(
                datasource_id=request.data["datasource_id"],
                username=request.data["username"],
                password=generated_password,
                privilege_level=request.data["privilege_level"],
                name=request.data.get("name", ""),
                email=email,
                platform_user=platform_user,
                is_platform_user=bool(request.data.get("is_platform_user", False)),
                platform_role=request.data.get("platform_role", ""),
                notes=request.data.get("notes", ""),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except NotImplementedError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        send_db_credentials(
            email,
            name=db_user.name or request.data["username"],
            username=db_user.username,
            password=generated_password,
            privilege_level=request.data["privilege_level"],
        )

        return Response(DatabaseUserSerializer(db_user).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="sync")
    def sync(self, request):
        """
        Read all DB-level users from a connected datasource and upsert them into IAM.
        Body: { datasource_id: "<uuid>" }
        """
        datasource_id = request.data.get("datasource_id")
        if not datasource_id:
            return Response({"detail": "datasource_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = sync_db_users(str(datasource_id))
            return Response(result)
        except NotImplementedError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"], url_path="toggle-status")
    def toggle_status(self, request, pk=None):
        user = self.get_object()
        user.status = "inactive" if user.status == "active" else "active"
        user.save(update_fields=["status", "updated_at"])
        return Response(DatabaseUserSerializer(user).data)


class AccessGroupViewSet(viewsets.ModelViewSet):
    queryset = AccessGroup.objects.prefetch_related("members", "data_islands").all()

    def get_serializer_class(self):
        if self.action == "list":
            return AccessGroupListSerializer
        if self.action in ("create", "update", "partial_update"):
            return AccessGroupCreateSerializer
        return AccessGroupDetailSerializer

    def create(self, request, *args, **kwargs):
        ser = AccessGroupCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        group = ser.save()
        return Response(AccessGroupDetailSerializer(group).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        ser = AccessGroupCreateSerializer(instance, data=request.data, partial=partial)
        ser.is_valid(raise_exception=True)
        group = ser.save()
        return Response(AccessGroupDetailSerializer(group).data)

    @action(detail=True, methods=["post"], url_path="add-member")
    def add_member(self, request, pk=None):
        group = self.get_object()
        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = DatabaseUser.objects.get(pk=user_id)
        except DatabaseUser.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        group.members.add(user)
        return Response(AccessGroupDetailSerializer(group).data)

    @action(detail=True, methods=["delete"], url_path=r"remove-member/(?P<user_id>[^/.]+)")
    def remove_member(self, request, pk=None, user_id=None):
        group = self.get_object()
        try:
            user = DatabaseUser.objects.get(pk=user_id)
        except DatabaseUser.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        group.members.remove(user)
        return Response(AccessGroupDetailSerializer(group).data)

    @action(detail=True, methods=["post"], url_path="add-island")
    def add_island(self, request, pk=None):
        group = self.get_object()
        island_id = request.data.get("island_id")
        if not island_id:
            return Response({"detail": "island_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            island = DataIsland.objects.get(pk=island_id)
        except DataIsland.DoesNotExist:
            return Response({"detail": "Data Island not found."}, status=status.HTTP_404_NOT_FOUND)
        group.data_islands.add(island)
        return Response(AccessGroupDetailSerializer(group).data)

    @action(detail=True, methods=["delete"], url_path=r"remove-island/(?P<island_id>[^/.]+)")
    def remove_island(self, request, pk=None, island_id=None):
        group = self.get_object()
        try:
            island = DataIsland.objects.get(pk=island_id)
        except DataIsland.DoesNotExist:
            return Response({"detail": "Data Island not found."}, status=status.HTTP_404_NOT_FOUND)
        group.data_islands.remove(island)
        return Response(AccessGroupDetailSerializer(group).data)
