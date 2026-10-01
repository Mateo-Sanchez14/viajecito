"""Settings of the linkpreview app, read lazily with defaults (the orchestrator adds the env
parsing to ``config/settings`` at integration)."""

from django.conf import settings

TOTAL_TIMEOUT_SECONDS = 8.0
CONNECT_TIMEOUT_SECONDS = 5.0
MAX_REDIRECTS = 4


def fetcher_name() -> str:
    """``httpx`` (default), ``static`` (dev/e2e canned previews) or ``fake`` (tests)."""
    return str(getattr(settings, "LINKPREVIEW_FETCHER", "httpx"))


def fetch_sync() -> bool:
    return bool(getattr(settings, "LINKPREVIEW_FETCH_SYNC", False))


def max_bytes() -> int:
    return int(getattr(settings, "LINKPREVIEW_MAX_BYTES", 1_048_576))
