from datetime import datetime

from linkpreview import ports
from linkpreview.ports import LinkPreviewFetcher, PreviewRef, PreviewStore
from linkpreview.use_cases.fetch_preview import fetch_preview
from linkpreview.use_cases.prepare_preview import prepare_preview
from shared.clock import SystemClock


def resolve_preview(
    url: str,
    *,
    force: bool = False,
    now: datetime | None = None,
    store: PreviewStore | None = None,
    fetcher: LinkPreviewFetcher | None = None,
) -> PreviewRef:
    """The preview of ``url``, unfurled synchronously when the cache has nothing fresh.

    Used by the bot (already off the request path). ``force`` skips the cache.
    """
    store = store or ports.default_store()
    fetcher = fetcher or ports.default_fetcher()
    prepared = prepare_preview(url, now=now or SystemClock().now(), store=store)
    if not (prepared.needs_fetch or force):
        return prepared.ref
    return fetch_preview(prepared.ref.id, store=store, fetcher=fetcher)
