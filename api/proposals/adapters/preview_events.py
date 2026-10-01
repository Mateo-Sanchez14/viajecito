import logging

from proposals.adapters import previews, wiring
from proposals.use_cases.apply_preview import apply_preview

logger = logging.getLogger(__name__)


def on_preview_fetched(
    *, preview_id: str, canonical_url: str, fetch_status: str, **_: object
) -> None:
    """``linkpreview.preview_fetched``: let the proposals built on the preview pick up its data."""
    preview = previews.fetched(preview_id)
    if preview is None:
        return
    changed = apply_preview(
        wiring.store(), preview, wiring.rules_classifier(), wiring.llm_classifier()
    )
    if changed:
        logger.info("preview %s updated %d proposal(s)", preview_id, changed)
