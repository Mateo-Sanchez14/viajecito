from dataclasses import dataclass
from datetime import datetime, timedelta

from linkpreview import conf, ports
from linkpreview.domain.preview import OK, PARTIAL
from linkpreview.domain.urls import normalize
from linkpreview.ports import PreviewRef, PreviewStore
from shared.clock import SystemClock


def is_fresh(ref: PreviewRef, now: datetime) -> bool:
    """A preview is reused for a week when it was fetched and has usable content."""
    return (
        ref.fetch_status in (OK, PARTIAL)
        and ref.fetched_at is not None
        and now - ref.fetched_at < timedelta(days=conf.REUSE_DAYS)
    )


@dataclass(frozen=True)
class PreparedPreview:
    ref: PreviewRef
    needs_fetch: bool


def prepare_preview(
    url: str, *, now: datetime | None = None, store: PreviewStore | None = None
) -> PreparedPreview:
    """The cached preview of ``url`` or a new ``pending`` row; says whether a fetch is needed.

    The web path uses it to answer immediately and unfurl off the request.
    """
    store = store or ports.default_store()
    now = now or SystemClock().now()
    cached = store.find(canonical_url=normalize(url), url=url)
    if cached is not None:
        return PreparedPreview(cached, needs_fetch=not is_fresh(cached, now))
    return PreparedPreview(store.get_or_create_pending(url, normalize(url)), needs_fetch=True)
