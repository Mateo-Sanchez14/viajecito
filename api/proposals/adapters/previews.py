"""Proposals' bridge to linkpreview: only its use cases, mapped to proposals' own types."""

from linkpreview.ports import PreviewRef
from linkpreview.use_cases.get_preview import get_preview
from linkpreview.use_cases.prepare_preview import prepare_preview
from linkpreview.use_cases.refresh_preview import RefreshTooSoonError, refresh_preview
from linkpreview.use_cases.resolve_preview import resolve_preview
from linkpreview.use_cases.schedule_fetch import schedule_preview_fetch
from proposals.domain.types import PreviewSummary

__all__ = [
    "RefreshTooSoonError",
    "fetched",
    "prepare",
    "refresh",
    "resolve",
    "schedule",
    "summary_of",
]


def summary_of(ref: PreviewRef) -> PreviewSummary:
    return PreviewSummary(
        id=ref.id,
        url=ref.url,
        final_url=ref.final_url,
        canonical_url=ref.canonical_url,
        site_name=ref.site_name,
        title=ref.title,
        description=ref.description,
        image_url=ref.image_url,
        has_thumbnail=ref.has_thumbnail,
        price_amount=ref.price_amount,
        price_currency=ref.price_currency,
        lat=ref.lat,
        lng=ref.lng,
        fetch_status=ref.fetch_status,
        fetched_at=ref.fetched_at,
    )


def resolve(url: str) -> PreviewSummary:
    """The preview of ``url``, unfurled synchronously when nothing fresh is cached (bot path)."""
    return summary_of(resolve_preview(url))


def prepare(url: str) -> tuple[PreviewSummary, bool]:
    """``(preview, needs_fetch)``: the cached preview or a ``pending`` row (web path)."""
    prepared = prepare_preview(url)
    return summary_of(prepared.ref), prepared.needs_fetch


def schedule(preview_id: str) -> None:
    schedule_preview_fetch(preview_id)


def fetched(preview_id: str) -> PreviewSummary | None:
    ref = get_preview(preview_id)
    return summary_of(ref) if ref else None


def refresh(preview_id: str) -> PreviewSummary:
    return summary_of(refresh_preview(preview_id))
