"""
IAM models.

Relationship rules:
  - A platform user (Django User) can be linked to MULTIPLE DatabaseUsers
    (one per environment they added to the system).
  - Each DatabaseUser belongs to at most ONE platform user (FK, not OneToOne).
  - The link is established at the moment an environment (DataSource) is added —
    the connecting DB credential username becomes the DatabaseUser and is linked
    to the platform user who added the environment.
"""

import uuid
from django.conf import settings
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from datasources.models import DataSource


PLATFORM_ROLE_CHOICES = [
    ("administrator", "Administrator"),
    ("assistant", "Assistant"),
]

STATUS_CHOICES = [
    ("active", "Active"),
    ("inactive", "Inactive"),
]


class DatabaseUser(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=255)

    datasource = models.ForeignKey(
        DataSource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="db_users",
    )

    # The platform user who owns this DB credential.
    # Many DatabaseUsers can point to the same platform user (one per environment).
    platform_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="db_users",
    )

    is_platform_user = models.BooleanField(default=False)
    platform_role = models.CharField(
        max_length=20, choices=PLATFORM_ROLE_CHOICES, blank=True,
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = [["username", "datasource"]]

    def __str__(self) -> str:
        return f"{self.name} ({self.email})"


class AccessGroup(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True)

    members = models.ManyToManyField(
        DatabaseUser,
        blank=True,
        related_name="access_groups",
    )
    data_islands = models.ManyToManyField(
        "data_islands.DataIsland",
        blank=True,
        related_name="access_groups",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return str(self.name)


class UserProfile(models.Model):
    """1:1 extension of Django auth User — auto-created on user save."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Profile({self.user.username})"


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def _create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.get_or_create(user=instance)
