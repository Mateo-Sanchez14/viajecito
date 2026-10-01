from linkpreview import ports
from linkpreview.domain.urls import canonical_after_redirect
from linkpreview.ports import LinkPreviewFetcher, PreviewRef, PreviewStore


def fetch_preview(
    preview_id: str,
    *,
    store: PreviewStore | None = None,
    fetcher: LinkPreviewFetcher | None = None,
) -> PreviewRef:
    """Unfurl the row's URL and store the outcome (a failure is a stored status, not an error).

    Returns the row that owns the resulting canonical URL: when a short Maps link resolves to a
    place another row already holds, that row is returned (this one keeps its own canonical form).
    """
    store = store or ports.default_store()
    fetcher = fetcher or ports.default_fetcher()
    ref = store.get(preview_id)
    if ref is None:
        raise LookupError(preview_id)
    data = fetcher.unfurl(ref.url)
    canonical = canonical_after_redirect(ref.url, data.final_url)
    saved = store.save_result(preview_id, data, canonical)
    if saved.canonical_url != canonical:
        owner = store.find(canonical_url=canonical, url="")
        if owner is not None:
            return owner
    return saved
