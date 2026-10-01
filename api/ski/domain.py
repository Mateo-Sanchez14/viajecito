"""Pure ski rules (no Django, no HTTP)."""

from datetime import datetime, timedelta

STALE_AFTER = timedelta(hours=12)
REFRESH_EVERY = timedelta(hours=3)
BACKOFF_BASE = timedelta(minutes=15)
BACKOFF_CAP = timedelta(hours=6)
MAX_RESORTS_PER_TICK = 4
ACTIVE_TRIP_STATUSES = ("planning", "booked", "ongoing")
PROVIDER_RETENTION = timedelta(days=30)


def is_stale(observed_at: datetime, now: datetime) -> bool:
    """A report older than 12 hours (strictly) renders as stale."""
    return now - observed_at > STALE_AFTER


def age_hours(observed_at: datetime, now: datetime) -> int:
    """Whole hours since ``observed_at`` (never negative)."""
    return max(int((now - observed_at).total_seconds() // 3600), 0)


def backoff_delay(consecutive_failures: int) -> timedelta:
    """15 min, 30 min, 1 h ... capped at 6 h after the n-th consecutive failure (n >= 1)."""
    exponent = min(max(consecutive_failures, 1) - 1, 10)
    return min(BACKOFF_BASE * 2**exponent, BACKOFF_CAP)


def is_due(
    now: datetime,
    *,
    last_success_at: datetime | None,
    next_attempt_at: datetime | None,
) -> bool:
    """Refresh a resort when its backoff window is over and the last success is >= 3 h old."""
    if next_attempt_at is not None and next_attempt_at > now:
        return False
    return last_success_at is None or now - last_success_at >= REFRESH_EVERY
