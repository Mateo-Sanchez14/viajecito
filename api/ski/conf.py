"""Ski settings, read with ``getattr`` so the app works before the orchestrator adds env parsing."""

from django.conf import settings


def tick_budget_seconds() -> float:
    """Wall-clock budget of one ``ski.snow_refresh`` run (a tick has ~2 minutes in total)."""
    return float(getattr(settings, "SKI_TICK_BUDGET_SECONDS", 30))


def manual_reports_per_hour() -> int:
    """Manual reports allowed per resort per hour."""
    return int(getattr(settings, "SKI_MANUAL_REPORTS_PER_HOUR", 6))


def public_origin() -> str:
    return str(getattr(settings, "PUBLIC_ORIGIN", "")).rstrip("/")
