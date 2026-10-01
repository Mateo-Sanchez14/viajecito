import logging
from datetime import datetime

from linkpreview import ports
from linkpreview.use_cases.fetch_preview import fetch_preview

logger = logging.getLogger(__name__)

MAX_PER_TICK = 3


def retry_pending(now: datetime) -> dict[str, int]:
    """Tick job: unfurl previews stuck in ``pending`` (> 2 min) and ``failed`` ones with attempts
    left (last attempt > 15 min ago), at most three per tick, oldest first."""
    store = ports.default_store()
    retried = 0
    for ref in store.retry_candidates(now, MAX_PER_TICK):
        try:
            fetch_preview(ref.id, store=store)
        except Exception:
            logger.exception("retrying preview %s failed", ref.id)
            continue
        retried += 1
    return {"retried": retried}
