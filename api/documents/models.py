import uuid

from django.conf import settings
from django.db import models

from documents.domain import MIME_EXT
from documents.storage import EncryptedFileSystemStorage


def vault_path(instance, filename):
    return f"vault/{instance.trip_id}/{uuid.uuid4()}.{MIME_EXT[instance.mime]}.enc"


class VaultQuota(models.Model):
    trip = models.OneToOneField("trips.Trip", on_delete=models.CASCADE, primary_key=True)
    plaintext_bytes = models.PositiveBigIntegerField(default=0)


class Document(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="documents")
    uploader = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    title = models.CharField(max_length=200)
    kind = models.CharField(max_length=16, default="other")
    file = models.FileField(
        storage=EncryptedFileSystemStorage(), upload_to=vault_path, max_length=200
    )
    original_name = models.CharField(max_length=200, default="")
    mime = models.CharField(max_length=64)
    size = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    visibility = models.CharField(max_length=12, default="crew")
    valid_until = models.DateField(null=True)
    proposal = models.ForeignKey(
        "proposals.Proposal", on_delete=models.SET_NULL, null=True, related_name="+"
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(visibility="owner_only") | models.Q(owner__isnull=False),
                name="private_document_owner_required",
            )
        ]
        indexes = [models.Index(fields=["trip", "kind"])]
