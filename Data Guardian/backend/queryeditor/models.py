"""
Query Editor models.

SavedQuery — a named SQL snippet a user has saved against one DataSource
(environment).

QuerySchedule — turns a SavedQuery into a recurring routine: on its cadence the
query is run and its result set is written into a dedicated `schedules` schema in
the target database (replace or append). QueryRun records each execution.

All scoped to the datasource owner via the same demo-scoping rules used
elsewhere (see core.permissions).
"""

import uuid

from django.conf import settings
from django.db import models

from datasources.models import DataSource


class SavedQuery(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    datasource = models.ForeignKey(
        DataSource, on_delete=models.CASCADE, related_name="saved_queries"
    )
    name = models.CharField(max_length=255)
    sql_text = models.TextField()

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="saved_queries",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name_plural = "Saved queries"

    def __str__(self):
        return self.name


CADENCE_TYPE_CHOICES = [
    ("cron", "Cron Expression"),
    ("frequency", "Frequency"),
]

WRITE_MODE_CHOICES = [
    ("replace", "Replace"),
    ("append", "Append"),
]

RUN_STATUS_CHOICES = [
    ("success", "Success"),
    ("error", "Error"),
]

RUN_TRIGGER_CHOICES = [
    ("schedule", "Schedule"),
    ("manual", "Manual"),
]


class QuerySchedule(models.Model):
    """A SavedQuery set to run on a recurring cadence and materialize into a table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    saved_query = models.ForeignKey(
        SavedQuery, on_delete=models.CASCADE, related_name="schedules"
    )
    # Denormalized from saved_query.datasource so scoping / filtering stay cheap
    # and consistent with the rest of the app's owner_lookup pattern.
    datasource = models.ForeignKey(
        DataSource, on_delete=models.CASCADE, related_name="query_schedules"
    )

    # Cadence — same vocabulary as data_islands (cron string OR
    # JSON '{"every": N, "unit": "hours"}').
    cadence_type = models.CharField(max_length=20, choices=CADENCE_TYPE_CHOICES, default="frequency")
    cadence_value = models.CharField(max_length=200)

    # Where the results land inside the target database.
    write_mode = models.CharField(max_length=20, choices=WRITE_MODE_CHOICES, default="replace")
    target_schema = models.CharField(max_length=64, default="schedules")
    target_table = models.CharField(max_length=128)

    is_active = models.BooleanField(default=True)

    # Optionally email the fresh result set on every run.
    email_enabled = models.BooleanField(default=False)
    email_recipients = models.TextField(blank=True)  # comma-separated addresses
    email_message = models.TextField(blank=True)

    next_run_at = models.DateTimeField(null=True, blank=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_status = models.CharField(max_length=20, blank=True)
    last_error = models.TextField(blank=True)
    last_row_count = models.IntegerField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="query_schedules",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = [["datasource", "target_schema", "target_table"]]

    def __str__(self):
        return f"{self.saved_query.name} → {self.target_schema}.{self.target_table}"


class QueryRun(models.Model):
    """One execution of a QuerySchedule (scheduled or manual 'run now')."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    schedule = models.ForeignKey(
        QuerySchedule, on_delete=models.CASCADE, related_name="runs"
    )
    status = models.CharField(max_length=20, choices=RUN_STATUS_CHOICES)
    write_mode = models.CharField(max_length=20, blank=True)
    target = models.CharField(max_length=256, blank=True)
    row_count = models.IntegerField(null=True, blank=True)
    elapsed_ms = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    trigger = models.CharField(max_length=20, choices=RUN_TRIGGER_CHOICES, default="schedule")
    # "" (no mailer) | "sent" | "failed" | "skipped" (enabled but no recipients)
    email_status = models.CharField(max_length=20, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.schedule_id} {self.status} @ {self.started_at:%Y-%m-%d %H:%M}"
