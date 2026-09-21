"""
Catalogue models — the output of the Data Catalogue module.

Hierarchy:
  DataSource → CatalogueRun → TableCatalogue → ColumnCatalogue

A CatalogueRun is created every time the user triggers catalogue generation,
allowing full history of how the schema and descriptions evolved over time.
"""

import json as _json
import uuid
from django.db import models
from datasources.models import DataSource


class JSONTextField(models.TextField):
    """TextField that transparently serialises/deserialises JSON.
    Drop-in replacement for models.JSONField when SQLite JSON1 is unavailable.
    """

    def from_db_value(self, value, expression, connection):
        return self.to_python(value)

    def to_python(self, value):
        if value is None or isinstance(value, (dict, list)):
            return value
        try:
            return _json.loads(value)
        except (ValueError, TypeError):
            return value

    def get_prep_value(self, value):
        if value is None:
            return None
        if isinstance(value, (dict, list, bool, int, float)):
            return _json.dumps(value)
        return value


RUN_STATUS_CHOICES = [
    ("pending", "Pending"),
    ("running", "Running"),
    ("completed", "Completed"),
    ("failed", "Failed"),
]

PII_LIKELIHOOD_CHOICES = [
    ("none", "None"),
    ("low", "Low"),
    ("medium", "Medium"),
    ("high", "High"),
]

DATA_CATEGORY_CHOICES = [
    ("identifier", "Identifier"),
    ("timestamp", "Timestamp"),
    ("metric", "Metric"),
    ("dimension", "Dimension"),
    ("flag", "Flag / Boolean"),
    ("text", "Free Text"),
    ("json", "JSON / Semi-Structured"),
    ("other", "Other"),
]


class CatalogueRun(models.Model):
    """Represents one execution of catalogue generation for a DataSource."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    datasource = models.ForeignKey(
        DataSource, on_delete=models.CASCADE, related_name="catalogue_runs"
    )
    status = models.CharField(max_length=20, choices=RUN_STATUS_CHOICES, default="pending")
    ai_provider = models.CharField(max_length=50, blank=True)
    ai_model = models.CharField(max_length=100, blank=True)
    error_message = models.TextField(blank=True)
    tables_processed = models.IntegerField(default=0)
    tables_total = models.IntegerField(default=0)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Run {self.id} — {self.datasource.name} ({self.status})"

    @property
    def progress_pct(self) -> int:
        if self.tables_total == 0:
            return 0
        return int(100 * self.tables_processed / self.tables_total)


class TableCatalogue(models.Model):
    """AI-generated + human-editable metadata for one database table."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(
        CatalogueRun, on_delete=models.CASCADE, related_name="tables"
    )
    datasource = models.ForeignKey(
        DataSource, on_delete=models.CASCADE, related_name="table_catalogues"
    )

    # Identifiers
    schema_name = models.CharField(max_length=255, blank=True)
    table_name = models.CharField(max_length=255)
    full_name = models.CharField(max_length=512)   # schema.table or just table

    # Raw schema snapshot (JSON) — what the connector returned
    raw_schema = JSONTextField(default=dict)

    # AI-generated fields
    ai_description = models.TextField(blank=True)
    ai_business_purpose = models.TextField(blank=True)
    ai_domain = models.CharField(max_length=100, blank=True)

    # Human-editable overrides
    description = models.TextField(blank=True)
    business_purpose = models.TextField(blank=True)
    domain = models.CharField(max_length=100, blank=True)
    tags = JSONTextField(default=list, blank=True)

    # Stats
    row_count_estimate = models.BigIntegerField(null=True, blank=True)

    # Verification
    is_verified = models.BooleanField(default=False)
    verified_by = models.CharField(max_length=255, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["full_name"]
        unique_together = [["run", "full_name"]]

    def __str__(self):
        return self.full_name

    @property
    def effective_description(self) -> str:
        """Return human override if set, else AI-generated."""
        return self.description or self.ai_description

    @property
    def effective_business_purpose(self) -> str:
        return self.business_purpose or self.ai_business_purpose

    @property
    def effective_domain(self) -> str:
        return self.domain or self.ai_domain


class ColumnCatalogue(models.Model):
    """AI-generated + human-editable metadata for one column."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    table = models.ForeignKey(
        TableCatalogue, on_delete=models.CASCADE, related_name="columns"
    )

    # Schema info (mirrored from connector output)
    column_name = models.CharField(max_length=255)
    data_type = models.CharField(max_length=100)
    nullable = models.BooleanField(default=True)
    is_primary_key = models.BooleanField(default=False)
    is_foreign_key = models.BooleanField(default=False)
    foreign_key_references = JSONTextField(null=True, blank=True)
    default_value = models.TextField(blank=True, null=True)
    max_length = models.IntegerField(null=True, blank=True)
    native_comment = models.TextField(blank=True, null=True)

    # AI-generated fields
    ai_description = models.TextField(blank=True)
    ai_business_name = models.CharField(max_length=255, blank=True)
    ai_data_category = models.CharField(max_length=50, choices=DATA_CATEGORY_CHOICES, default="other")
    ai_pii_likelihood = models.CharField(max_length=10, choices=PII_LIKELIHOOD_CHOICES, default="none")

    # Human-editable overrides
    description = models.TextField(blank=True)
    business_name = models.CharField(max_length=255, blank=True)
    data_category = models.CharField(max_length=50, choices=DATA_CATEGORY_CHOICES, blank=True)
    pii_likelihood = models.CharField(max_length=10, choices=PII_LIKELIHOOD_CHOICES, blank=True)
    is_pii_confirmed = models.BooleanField(default=False)

    ordinal_position = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["ordinal_position"]
        unique_together = [["table", "column_name"]]

    def __str__(self):
        return f"{self.table.full_name}.{self.column_name}"

    @property
    def effective_description(self) -> str:
        return self.description or self.ai_description

    @property
    def effective_business_name(self) -> str:
        return self.business_name or self.ai_business_name

    @property
    def effective_pii_likelihood(self) -> str:
        return self.pii_likelihood or self.ai_pii_likelihood

    @property
    def effective_data_category(self) -> str:
        return self.data_category or self.ai_data_category


CARDINALITY_CHOICES = [
    ("many-to-one",  "Many to One"),
    ("one-to-many",  "One to Many"),
    ("one-to-one",   "One to One"),
    ("many-to-many", "Many to Many"),
]

RULE_SOURCE_CHOICES = [
    ("fk",     "Foreign Key Constraint"),
    ("name",   "Name-based Detection"),
    ("ai",     "AI Inference"),
    ("manual", "Manual"),
]


class RelationshipRule(models.Model):
    """A single table-to-table relationship rule for the Data Map."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    datasource = models.ForeignKey(
        DataSource, on_delete=models.CASCADE, related_name="relationship_rules"
    )
    from_table  = models.CharField(max_length=255)   # FK / child table
    from_column = models.CharField(max_length=255)   # FK column
    to_table    = models.CharField(max_length=255)   # PK / parent table
    to_column   = models.CharField(max_length=255)   # PK column
    cardinality = models.CharField(max_length=20, choices=CARDINALITY_CHOICES, default="many-to-one")
    label       = models.CharField(max_length=255, blank=True)
    is_auto     = models.BooleanField(default=False)  # True = auto-detected
    is_active   = models.BooleanField(default=True)   # False = user suppressed it
    source      = models.CharField(max_length=10, choices=RULE_SOURCE_CHOICES, default="manual")
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["from_table", "from_column"]
        unique_together = [["datasource", "from_table", "from_column", "to_table", "to_column"]]

    def __str__(self):
        return f"{self.from_table}.{self.from_column} → {self.to_table}.{self.to_column}"
