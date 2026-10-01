"""Tunable settings, read lazily with ``getattr`` defaults (env parsing is added at integration)."""

from django.conf import settings


def nudge_window_hours() -> int:
    """How close to the deadline the missing-votes reminder starts."""
    return int(getattr(settings, "DECISIONS_NUDGE_WINDOW_HOURS", 48))


def nudge_after_days() -> int:
    """Without a deadline: days an open decision waits before its one missing-votes nudge."""
    return int(getattr(settings, "DECISIONS_NUDGE_AFTER_DAYS", 3))


def public_origin() -> str:
    return str(getattr(settings, "PUBLIC_ORIGIN", "http://localhost:3000")).rstrip("/")
