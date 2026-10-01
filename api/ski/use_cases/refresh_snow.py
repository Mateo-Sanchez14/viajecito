"""The ``ski.snow_refresh`` tick job: fetch snow for resorts on active trips, with backoff."""

import logging
from collections.abc import Callable
from datetime import datetime

from ski import domain
from ski.ports import ProviderError, SnowRefreshStore, SnowReportProvider

logger = logging.getLogger(__name__)


def refresh_snow(
    now: datetime,
    store: SnowRefreshStore,
    provider: SnowReportProvider,
    *,
    has_time: Callable[[], bool] = lambda: True,
    limit: int = domain.MAX_RESORTS_PER_TICK,
) -> dict[str, int]:
    """Fetch at most ``limit`` due resorts, one after the other, while ``has_time()`` holds.
    Never raises: failures are recorded per resort and counted."""
    fetched = failed = 0
    due = [
        c
        for c in store.eligible_resorts(now)
        if domain.is_due(
            now, last_success_at=c.state.last_success_at, next_attempt_at=c.state.next_attempt_at
        )
    ]
    due.sort(key=lambda c: (c.state.last_success_at is not None, c.state.last_success_at or now))
    for candidate in due[:limit]:
        if not has_time():
            break
        resort = candidate.resort
        try:
            reading = provider.fetch(resort, now)
            store.record_success(resort.id, reading, now)
            fetched += 1
        except Exception as exc:  # the job must never take the tick down
            reason = exc.reason if isinstance(exc, ProviderError) else "unexpected"
            if reason == "unexpected":
                logger.exception("snow refresh crashed for %s", resort.slug)
            else:
                logger.warning("snow refresh failed for %s: %s", resort.slug, reason)
            failures = candidate.state.consecutive_failures + 1
            try:
                store.record_failure(
                    resort.id, reason, now, now + domain.backoff_delay(failures), failures
                )
            except Exception:
                logger.exception("could not record the snow failure of %s", resort.slug)
            failed += 1
    if fetched:
        try:
            store.prune_provider_reports(now - domain.PROVIDER_RETENTION)
        except Exception:
            logger.exception("could not prune old snow reports")
    return {"snow_fetched": fetched, "snow_failed": failed}
