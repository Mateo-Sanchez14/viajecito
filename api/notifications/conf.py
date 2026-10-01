"""Notifications settings, read lazily with defaults (the orchestrator adds the env parsing)."""

from collections.abc import Sequence

from django.conf import settings

from notifications.domain.subscriptions import DEFAULT_ENDPOINT_HOSTS


def vapid_public_key() -> str:
    return getattr(settings, "NOTIFICATIONS_VAPID_PUBLIC_KEY", "") or ""


def vapid_private_key() -> str:
    return getattr(settings, "NOTIFICATIONS_VAPID_PRIVATE_KEY", "") or ""


def vapid_subject() -> str:
    """``mailto:`` or ``https://<host>``; falls back to the public origin."""
    return getattr(settings, "NOTIFICATIONS_VAPID_SUBJECT", "") or getattr(
        settings, "PUBLIC_ORIGIN", ""
    )


def push_enabled() -> bool:
    return bool(vapid_public_key() and vapid_private_key())


def endpoint_hosts() -> Sequence[str]:
    raw = getattr(settings, "NOTIFICATIONS_PUSH_ENDPOINT_HOSTS", None)
    if not raw:
        return DEFAULT_ENDPOINT_HOSTS
    if isinstance(raw, str):
        raw = raw.split(",")
    return tuple(host.strip() for host in raw if host.strip())


def push_timeout_seconds() -> float:
    return float(getattr(settings, "NOTIFICATIONS_PUSH_TIMEOUT_SECONDS", 5))


def push_budget_seconds() -> float:
    """Wall-clock cap for all the sends of one reminder (keeps the tick channel fast)."""
    return float(getattr(settings, "NOTIFICATIONS_PUSH_BUDGET_SECONDS", 20))
