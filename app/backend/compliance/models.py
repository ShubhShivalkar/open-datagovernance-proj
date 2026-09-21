import uuid
from django.conf import settings
from django.db import models

from catalogue.models import JSONTextField


ERASURE_STATUS_CHOICES = [
    ("draft",            "Draft"),
    ("planned",          "Plan Ready"),
    ("pending_approval", "Pending Approval"),
    ("approved",         "Approved"),
    ("executing",        "Executing"),
    ("completed",        "Completed"),
    ("failed",           "Failed"),
    ("cancelled",        "Cancelled"),
]

ERASURE_INPUT_TYPE_CHOICES = [
    ("text",  "Text (comma/newline-separated)"),
    ("csv",   "CSV Upload"),
    ("table", "From Connected Table"),
]


class ErasureRequest(models.Model):
    id                = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    datasource        = models.ForeignKey(
        "datasources.DataSource", on_delete=models.CASCADE, related_name="erasure_requests"
    )
    data_principal_id = models.CharField(max_length=500)
    identifier_table  = models.CharField(max_length=255)
    identifier_column = models.CharField(max_length=255)
    input_type        = models.CharField(max_length=10, choices=ERASURE_INPUT_TYPE_CHOICES)
    input_raw         = models.TextField()
    input_resolved    = JSONTextField(default=list)
    reason            = models.TextField(blank=True)
    status            = models.CharField(max_length=20, choices=ERASURE_STATUS_CHOICES, default="draft")
    requested_by      = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="erasure_requests"
    )
    error_message     = models.TextField(blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"ErasureRequest({self.data_principal_id}, {self.status})"


class ErasurePlan(models.Model):
    """Computed erasure plan — set of table × row_pk tuples to delete."""

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request    = models.OneToOneField(ErasureRequest, on_delete=models.CASCADE, related_name="plan")
    plan_data  = JSONTextField(default=list)
    total_rows = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"ErasurePlan({self.request_id}, {self.total_rows} rows)"


class ErasureApproval(models.Model):
    """DGO approval record for an erasure request."""

    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request             = models.OneToOneField(ErasureRequest, on_delete=models.CASCADE, related_name="approval")
    approved_by         = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="erasure_approvals"
    )
    confirmation_phrase = models.CharField(max_length=500)
    approved_at         = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"ErasureApproval({self.request_id})"


class ErasureAuditLog(models.Model):
    """Immutable, append-only compliance audit record. Cannot be updated or deleted."""

    id                = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request_id        = models.CharField(max_length=100)
    data_principal_id = models.CharField(max_length=500)
    identifier_field  = models.CharField(max_length=512)
    identifier_values = JSONTextField(default=list)
    tables_affected   = JSONTextField(default=list)
    rows_deleted      = models.IntegerField()
    approver_identity = models.CharField(max_length=500)
    approved_at       = models.DateTimeField()
    executed_at       = models.DateTimeField()
    created_at        = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise PermissionError("ErasureAuditLog is immutable — updates are not permitted.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("ErasureAuditLog cannot be deleted.")

    def __str__(self):
        return f"ErasureAuditLog({self.request_id})"


# ---------------------------------------------------------------------------
# Data Access Request (DSAR) models
# ---------------------------------------------------------------------------

ACCESS_STATUS_CHOICES = [
    ("draft",        "Draft"),
    ("discovering",  "Discovering Data"),
    ("discovered",   "Data Discovered"),
    ("report_ready", "Report Ready"),
    ("sent",         "Report Sent"),
    ("failed",       "Failed"),
    ("cancelled",    "Cancelled"),
]


class AccessRequest(models.Model):
    """A Data Subject Access Request (DSAR) — asks what personal data exists for a principal."""

    id                = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    datasource        = models.ForeignKey(
        "datasources.DataSource", on_delete=models.CASCADE, related_name="access_requests"
    )
    subject_id        = models.CharField(max_length=500)        # raw ID value (e.g. "42")
    subject_email     = models.EmailField(max_length=500)       # primary delivery address
    additional_emails = JSONTextField(default=list)             # optional extra recipients
    identifier_table  = models.CharField(max_length=255)
    identifier_column = models.CharField(max_length=255)
    status            = models.CharField(max_length=20, choices=ACCESS_STATUS_CHOICES, default="draft")
    requested_by      = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="access_requests"
    )
    error_message     = models.TextField(blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"AccessRequest({self.subject_email}, {self.status})"


class AccessDiscovery(models.Model):
    """BFS result for a DSAR — tables and rows found, enriched with PII catalogue data."""

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request        = models.OneToOneField(AccessRequest, on_delete=models.CASCADE, related_name="discovery")
    discovery_data = JSONTextField(default=list)   # list of table-level summaries (no raw row values)
    total_rows     = models.IntegerField(default=0)
    created_at     = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"AccessDiscovery({self.request_id}, {self.total_rows} rows)"
