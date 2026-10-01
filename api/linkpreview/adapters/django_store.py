import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import F, Q

from linkpreview.domain.preview import FAILED, PENDING, PreviewData
from linkpreview.models import LinkPreview
from linkpreview.ports import PreviewRef
from shared.clock import SystemClock
from shared.events_django import publish_after_commit

PENDING_RETRY_AFTER = timedelta(minutes=2)
FAILED_RETRY_AFTER = timedelta(minutes=15)
MAX_FAILED_ATTEMPTS = 3


def to_ref(row: LinkPreview) -> PreviewRef:
    return PreviewRef(
        id=str(row.pk),
        url=row.url,
        canonical_url=row.canonical_url,
        final_url=row.final_url,
        site_name=row.site_name,
        title=row.title,
        description=row.description,
        image_url=row.image_url,
        has_thumbnail=bool(row.thumb_file),
        price_amount=row.price_amount,
        price_currency=row.price_currency,
        lat=float(row.lat) if row.lat is not None else None,
        lng=float(row.lng) if row.lng is not None else None,
        fetch_status=row.fetch_status,
        fetch_error=row.fetch_error,
        fetch_attempts=row.fetch_attempts,
        fetched_at=row.fetched_at,
    )


def _coordinate(value: float | None) -> Decimal | None:
    return None if value is None else Decimal(str(round(value, 6)))


class DjangoPreviewStore:
    def get(self, preview_id: str) -> PreviewRef | None:
        row = LinkPreview.objects.filter(pk=preview_id).first()
        return to_ref(row) if row else None

    def find(self, *, canonical_url: str, url: str) -> PreviewRef | None:
        row = LinkPreview.objects.filter(canonical_url=canonical_url).first()
        if row is None and url:
            row = LinkPreview.objects.filter(url=url).order_by("created_at").first()
        return to_ref(row) if row else None

    def get_or_create_pending(self, url: str, canonical_url: str) -> PreviewRef:
        row, _ = LinkPreview.objects.get_or_create(
            canonical_url=canonical_url, defaults={"url": url, "fetch_status": PENDING}
        )
        return to_ref(row)

    def save_result(self, preview_id: str, data: PreviewData, canonical_url: str) -> PreviewRef:
        with transaction.atomic():
            row = LinkPreview.objects.select_for_update().get(pk=preview_id)
            if (
                canonical_url != row.canonical_url
                and not LinkPreview.objects.filter(canonical_url=canonical_url).exists()
            ):
                row.canonical_url = canonical_url
            row.final_url = data.final_url
            row.site_name = data.site_name
            row.title = data.title
            row.description = data.description
            row.image_url = data.image_url
            row.price_amount = data.price_amount
            row.price_currency = data.price_currency
            row.lat = _coordinate(data.lat)
            row.lng = _coordinate(data.lng)
            row.fetch_status = data.fetch_status
            row.fetch_error = data.fetch_error
            row.fetch_attempts += 1
            row.fetched_at = SystemClock().now()
            row.raw = data.raw
            old_thumb = row.thumb_file.name if row.thumb_file else ""
            if data.thumbnail:
                row.thumb_file.save(f"{uuid.uuid4()}.webp", ContentFile(data.thumbnail), save=False)
            row.save()
            if data.thumbnail and old_thumb:
                row.thumb_file.storage.delete(old_thumb)
            publish_after_commit(
                "linkpreview.preview_fetched",
                preview_id=str(row.pk),
                canonical_url=row.canonical_url,
                fetch_status=row.fetch_status,
            )
        return to_ref(row)

    def mark_pending(self, preview_id: str) -> PreviewRef:
        LinkPreview.objects.filter(pk=preview_id).update(
            fetch_status=PENDING, updated_at=SystemClock().now()
        )
        return to_ref(LinkPreview.objects.get(pk=preview_id))

    def record_failure(self, preview_id: str, error: str) -> PreviewRef:
        now = SystemClock().now()
        LinkPreview.objects.filter(pk=preview_id).update(
            fetch_status=FAILED,
            fetch_error=error[:200],
            fetch_attempts=F("fetch_attempts") + 1,
            fetched_at=now,
            updated_at=now,
        )
        return to_ref(LinkPreview.objects.get(pk=preview_id))

    def retry_candidates(self, now: datetime, limit: int) -> list[PreviewRef]:
        stuck = Q(fetch_status=PENDING, updated_at__lt=now - PENDING_RETRY_AFTER)
        failed = Q(
            fetch_status=FAILED,
            fetch_attempts__lt=MAX_FAILED_ATTEMPTS,
            updated_at__lt=now - FAILED_RETRY_AFTER,
        )
        rows = LinkPreview.objects.filter(stuck | failed).order_by("updated_at", "pk")[:limit]
        return [to_ref(row) for row in rows]
