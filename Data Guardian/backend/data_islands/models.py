"""
Data Islands models.

Hierarchy:
  DataSource → DataIsland → DataIslandTable (one VIEW per table)
                          → DataIslandAccess (per-user grants)

A DataIsland represents a governed, shareable set of SQL VIEWs created inside a
user's connected database — one VIEW per selected table.
Metadata lives in the local SQLite app DB; actual VIEWs live in the host database.
"""

import uuid
from django.db import models
from datasources.models import DataSource


STATUS_CHOICES = [
    ("draft",  "Draft"),
    ("active", "Active"),
    ("error",  "Error"),
    ("stale",  "Stale"),
]

REFRESH_MODE_CHOICES = [
    ("manual",    "Manual"),
    ("scheduled", "Scheduled"),
]

REFRESH_TYPE_CHOICES = [
    ("static",    "Static (one-time)"),
    ("scheduled", "Scheduled"),
]

SCHEDULE_TYPE_CHOICES = [
    ("cron",      "Cron Expression"),
    ("frequency", "Frequency"),
]

PII_POLICY_CHOICES = [
    ("allow",   "Allow All"),
    ("hide",    "Exclude PII Columns"),
    ("encrypt", "MD5 Hash PII Columns"),
]

REFRESH_STRATEGY_CHOICES = [
    ("full",        "Full Refresh"),
    ("incremental", "Incremental"),
]

ROLE_CHOICES = [
    ("viewer", "Viewer"),
    ("editor", "Editor"),
]


class DataIsland(models.Model):
    """
    A governed set of SQL VIEWs materialized inside the host database.

    Each selected table gets its own VIEW named di_{island_slug}_{table_slug}.
    The island-level fields control refresh scheduling and PII policy.
    Legacy single-view fields (view_name, sql_query, source_tables) are kept
    blank for backward compatibility with Phase 1 islands.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    datasource = models.ForeignKey(
        DataSource,
        on_delete=models.CASCADE,
        related_name="data_islands",
    )

    # ── Legacy fields (Phase 1) — kept for backward compat, blank on new islands ──
    view_name = models.CharField(max_length=255, blank=True)
    sql_query = models.TextField(blank=True)
    source_tables = models.JSONField(default=list, blank=True)
    refresh_mode = models.CharField(max_length=20, choices=REFRESH_MODE_CHOICES, default="manual", blank=True)
    refresh_schedule = models.CharField(max_length=100, blank=True)

    # ── Phase 2 fields ────────────────────────────────────────────────────────
    refresh_type = models.CharField(
        max_length=20, choices=REFRESH_TYPE_CHOICES, default="static",
    )
    schedule_type = models.CharField(
        max_length=20, choices=SCHEDULE_TYPE_CHOICES, default="cron", blank=True,
    )
    # Cron string OR JSON '{"every": 6, "unit": "hours"}' depending on schedule_type
    schedule_value = models.CharField(max_length=200, blank=True)
    next_run_at = models.DateTimeField(null=True, blank=True)

    pii_policy = models.CharField(
        max_length=20, choices=PII_POLICY_CHOICES, default="allow",
    )
    refresh_strategy = models.CharField(
        max_length=20, choices=REFRESH_STRATEGY_CHOICES, default="full",
    )

    # ── Common fields ─────────────────────────────────────────────────────────
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    last_error = models.TextField(blank=True)
    last_refreshed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.datasource.name})"


class DataIslandTable(models.Model):
    """
    Tracks one per-table VIEW created for a DataIsland.

    Naming: data_islands.di_{island_slug}_{table_slug} (max 100 chars, unique across all islands).
    The sql_query is the full generated SELECT stored verbatim after each refresh.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    island = models.ForeignKey(
        DataIsland,
        on_delete=models.CASCADE,
        related_name="island_tables",
    )

    table_name = models.CharField(max_length=255)
    view_name = models.CharField(max_length=100, unique=True)
    sql_query = models.TextField()
    time_column = models.CharField(max_length=255, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    last_error = models.TextField(blank=True)
    last_refreshed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["table_name"]
        unique_together = [["island", "table_name"]]

    def __str__(self):
        return f"{self.island.name} / {self.table_name} → {self.view_name}"


class DataIslandAccess(models.Model):
    """
    Grants a user access to a DataIsland.

    Auth is not implemented yet — `email` is the authoritative identifier.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    island = models.ForeignKey(
        DataIsland,
        on_delete=models.CASCADE,
        related_name="access_grants",
    )
    email = models.EmailField(max_length=255)
    name = models.CharField(max_length=255, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="viewer")
    granted_at = models.DateTimeField(auto_now_add=True)
    granted_by = models.CharField(max_length=255, blank=True)

    class Meta:
        unique_together = [["island", "email"]]
        ordering = ["granted_at"]

    def __str__(self):
        return f"{self.email} → {self.island.name} ({self.role})"
