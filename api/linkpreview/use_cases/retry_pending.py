import logging
import time
from collections.abc import Callable
from datetime import datetime

from linkpreview import ports
from linkpreview.use_cases.fetch_preview import fetch_preview

logger = logging.getLogger(__name__)

MAX_PER_TICK = 3


TIME_BUDGET_SECONDS = 10.0  # a tick must stay well inside its lock


def retry_pending(
    now: datetime, *, out_of_time: Callable[[], bool] | None = None
) -> dict[str, int]:
    """Tick job: unfurl previews stuck in ``pending`` (> 2 min) and ``failed`` ones with attempts
    left (last attempt > 15 min ago), at most three per tick, oldest first."""
    store = ports.default_store()
    if out_of_time is None:
        started = time.monotonic()

        def out_of_time() -> bool:
            return time.monotonic() - started > TIME_BUDGET_SECONDS

    retried = 0
    for ref in store.retry_candidates(now, MAX_PER_TICK):
        if retried and out_of_time():  # stop between candidates, never mid-fetch
            break
        try:
            fetch_preview(ref.id, store=store)
        except Exception:
            logger.exception("retrying preview %s failed", ref.id)
            continue
        retried += 1
    return {"retried": retried}
