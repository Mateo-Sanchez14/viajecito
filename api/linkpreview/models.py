import uuid

from django.db import models


class LinkPreview(models.Model):
    """Shared unfurl cache: one row per canonical URL, not scoped to any trip."""

    class FetchStatus(models.TextChoices):
        PENDING = "pending"
        OK = "ok"
        PARTIAL = "partial"
        BLOCKED = "blocked"
        FAILED = "failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    url = models.URLField(max_length=2000)  # first URL seen, tracking parameters already stripped
    canonical_url = models.CharField(max_length=2000, unique=True)
    final_url = models.URLField(max_length=2000, blank=True, default="")  # after redirects
    site_name = models.CharField(max_length=200, blank=True, default="")
    title = models.CharField(max_length=300, blank=True, default="")
    description = models.CharField(max_length=1000, blank=True, default="")
    image_url = models.URLField(max_length=2000, blank=True, default="")
    thumb_file = models.ImageField(upload_to="linkpreview/thumbs/", null=True, blank=True)
    price_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    price_currency = models.CharField(max_length=3, blank=True, default="")
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    fetch_status = models.CharField(
        max_length=16, choices=FetchStatus.choices, default=FetchStatus.PENDING
    )
    fetch_error = models.CharField(max_length=200, blank=True, default="")  # a reason code
    fetch_attempts = models.PositiveSmallIntegerField(default=0)
    fetched_at = models.DateTimeField(null=True, blank=True)
    raw = models.JSONField(default=dict, blank=True)  # extracted meta only, never full HTML
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["fetch_status"])]

    def __str__(self) -> str:
        return f"{self.canonical_url} [{self.fetch_status}]"
