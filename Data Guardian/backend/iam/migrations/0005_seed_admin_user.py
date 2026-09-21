"""
Data migration: seed the default admin platform user.

Creates username=admin (password from the SEED_ADMIN_PASSWORD env var) if it
doesn't already exist. Seeding is skipped entirely when SEED_ADMIN_PASSWORD is
unset, so a fresh clone never ends up with a known default login.
UserProfile is created explicitly because signals do not fire during migrations.

This migration is idempotent — safe to run on an existing database that
already has an admin user.
"""

import os

from django.db import migrations


def seed_admin(apps, schema_editor):
    password = os.getenv("SEED_ADMIN_PASSWORD")
    if not password:
        return

    User = apps.get_model("auth", "User")
    UserProfile = apps.get_model("iam", "UserProfile")

    if User.objects.filter(username="admin").exists():
        return

    user = User.objects.create_superuser(
        username="admin",
        email=os.getenv("SEED_ADMIN_EMAIL", "admin@dataGuardian.local"),
        password=password,
    )
    UserProfile.objects.get_or_create(user=user)


def unseed_admin(apps, schema_editor):
    apps.get_model("auth", "User").objects.filter(username="admin").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("iam", "0004_remove_userprofile_db_user_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_admin, unseed_admin),
    ]
