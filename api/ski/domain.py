"""Pure ski rules (no Django, no HTTP)."""

from datetime import datetime, timedelta

STALE_AFTER = timedelta(hours=12)
REFRESH_EVERY = timedelta(hours=3)
BACKOFF_BASE = timedelta(minutes=15)
BACKOFF_CAP = timedelta(hours=6)
MAX_RESORTS_PER_TICK = 4
PROVIDER_RETENTION = timedelta(days=30)


def is_stale(observed_at: datetime, now: datetime) -> bool:
    """A report older than 12 hours (strictly) renders as stale."""
    return now - observed_at > STALE_AFTER


def age_hours(observed_at: datetime, now: datetime) -> int:
    """Whole hours since ``observed_at`` (never negative)."""
    return max(int((now - observed_at).total_seconds() // 3600), 0)
