"""Ports of the linkpreview app (pure: no Django, no HTTP)."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Protocol

from linkpreview.domain.preview import PreviewData


class Resolver(Protocol):
    def resolve(self, host: str) -> list[str]:
        """Every A/AAAA address of ``host`` (empty when it does not resolve)."""
        ...


class LinkPreviewFetcher(Protocol):
    def unfurl(self, url: str) -> PreviewData:
        """Fetch and parse ``url`` safely. Failures are returned as values, never raised."""
        ...


@dataclass(frozen=True)
class PreviewRef:
    """What other apps get to know about a stored preview."""

    id: str
    url: str
    canonical_url: str
    final_url: str
    site_name: str
    title: str
    description: str
    image_url: str
    has_thumbnail: bool
    price_amount: Decimal | None
    price_currency: str
    lat: float | None
    lng: float | None
    fetch_status: str
    fetch_error: str
    fetch_attempts: int
    fetched_at: datetime | None


class PreviewStore(Protocol):
    def get(self, preview_id: str) -> PreviewRef | None: ...

    def find(self, *, canonical_url: str, url: str) -> PreviewRef | None:
        """The row cached under this canonical URL or first seen under this exact URL."""
        ...

    def get_or_create_pending(self, url: str, canonical_url: str) -> PreviewRef: ...

    def save_result(self, preview_id: str, data: PreviewData, canonical_url: str) -> PreviewRef:
        """Store a fetch result (attempt counted), the thumbnail included."""
        ...

    def mark_pending(self, preview_id: str) -> PreviewRef:
        """Put a settled preview back in ``pending`` (a manual refresh is queued)."""
        ...

    def record_failure(self, preview_id: str, error: str) -> PreviewRef:
        """Count a failed attempt (status ``failed``, ``updated_at`` bumped): the safety net for a
        fetcher that raised, so a row can never stay ``pending`` at zero attempts."""
        ...

    def retry_candidates(self, now: datetime, limit: int) -> list[PreviewRef]: ...


class FetchScheduler(Protocol):
    def schedule(self, preview_id: str) -> None:
        """Run ``fetch_preview(preview_id)`` off the request path (inline in tests)."""
        ...


_default_store: Callable[[], PreviewStore] | None = None
_default_fetcher: Callable[[], LinkPreviewFetcher] | None = None
_default_scheduler: Callable[[], FetchScheduler] | None = None


def set_defaults(
    store: Callable[[], PreviewStore],
    fetcher: Callable[[], LinkPreviewFetcher],
    scheduler: Callable[[], FetchScheduler],
) -> None:
    """Composition root hook: ``LinkpreviewConfig.ready()`` installs the adapters here, so the use
    cases other apps call need no adapter import."""
    global _default_store, _default_fetcher, _default_scheduler
    _default_store, _default_fetcher, _default_scheduler = store, fetcher, scheduler


def default_store() -> PreviewStore:
    if _default_store is None:
        raise RuntimeError("no default preview store configured (is linkpreview installed?)")
    return _default_store()


def default_fetcher() -> LinkPreviewFetcher:
    if _default_fetcher is None:
        raise RuntimeError("no default link preview fetcher configured")
    return _default_fetcher()


def default_scheduler() -> FetchScheduler:
    if _default_scheduler is None:
        raise RuntimeError("no default fetch scheduler configured")
    return _default_scheduler()
