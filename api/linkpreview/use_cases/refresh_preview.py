from datetime import datetime, timedelta

from linkpreview import ports
from linkpreview.domain.preview import PENDING
from linkpreview.ports import PreviewRef
from shared.clock import SystemClock

REFRESH_INTERVAL = timedelta(minutes=10)


class RefreshTooSoonError(Exception):
    """The preview is being fetched or was fetched in the last 10 minutes."""


def refresh_preview(preview_id: str, *, now: datetime | None = None) -> PreviewRef:
    """Queue a new unfurl of a settled preview (at most once per 10 minutes)."""
    now = now or SystemClock().now()
    store = ports.default_store()
    ref = store.get(preview_id)
    if ref is None:
        raise LookupError(preview_id)
    if ref.fetch_status == PENDING or (
        ref.fetched_at is not None and now - ref.fetched_at < REFRESH_INTERVAL
    ):
        raise RefreshTooSoonError(preview_id)
    queued = store.mark_pending(preview_id)
    ports.default_scheduler().schedule(preview_id)
    return queued
