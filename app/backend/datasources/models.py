"""
DataSource model — stores connection metadata for a user's external database.

Credentials are stored encrypted using Fernet symmetric encryption.
The encryption key lives in settings.CREDENTIAL_ENCRYPTION_KEY.
"""

import json
import uuid
from django.db import models
from django.conf import settings
from datasources.connectors import SUPPORTED_DB_TYPES


def _fernet():
    from cryptography.fernet import Fernet
    key = settings.CREDENTIAL_ENCRYPTION_KEY
    if not key:
        raise RuntimeError(
            "CREDENTIAL_ENCRYPTION_KEY is not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


DB_TYPE_CHOICES = [(t, t.title()) for t in SUPPORTED_DB_TYPES]

STATUS_CHOICES = [
    ("pending", "Pending"),
    ("connected", "Connected"),
    ("error", "Error"),
]


class DataSource(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    db_type = models.CharField(max_length=50, choices=DB_TYPE_CHOICES)

    # Encrypted JSON blob containing connection parameters
    _credentials_encrypted = models.BinaryField(db_column="credentials_encrypted")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    last_tested_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)

    # Optional user context passed to the AI during catalogue generation
    business_context = models.TextField(
        blank=True,
        help_text="Describe the business domain so the AI produces richer descriptions.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.db_type})"

    # ------------------------------------------------------------------
    # Credential encryption helpers
    # ------------------------------------------------------------------

    def set_credentials(self, creds: dict):
        """Encrypt and store a credentials dict."""
        f = _fernet()
        self._credentials_encrypted = f.encrypt(json.dumps(creds).encode())

    def get_credentials(self) -> dict:
        """Decrypt and return the credentials dict."""
        f = _fernet()
        raw = bytes(self._credentials_encrypted)
        return json.loads(f.decrypt(raw).decode())
