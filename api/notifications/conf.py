"""Notifications settings, read lazily with defaults (the orchestrator adds the env parsing)."""

import base64
import re
from collections.abc import Sequence

from cryptography.hazmat.primitives import serialization
from django.conf import settings
from py_vapid import Vapid

from notifications.domain.subscriptions import DEFAULT_ENDPOINT_HOSTS


def vapid_public_key() -> str:
    return getattr(settings, "NOTIFICATIONS_VAPID_PUBLIC_KEY", "") or ""


def vapid_private_key() -> str:
    return getattr(settings, "NOTIFICATIONS_VAPID_PRIVATE_KEY", "") or ""


def vapid_subject() -> str:
    """``mailto:`` or ``https://<host>``; falls back to the public origin when that is https."""
    subject = getattr(settings, "NOTIFICATIONS_VAPID_SUBJECT", "") or ""
    if subject:
        return subject
    origin = getattr(settings, "PUBLIC_ORIGIN", "") or ""
    return origin if origin.startswith("https://") else ""


def _subject_ok(subject: str) -> bool:
    return (subject.startswith("mailto:") and len(subject) > len("mailto:")) or (
        subject.startswith("https://") and len(subject) > len("https://")
    )


def _keys_ok(public: str, private: str) -> bool:
    try:
        derived = Vapid.from_string(private).public_key.public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
    except Exception:  # any parse failure means the key is unusable; never log key material
        return False
    return base64.urlsafe_b64encode(derived).decode().rstrip("=") == public.rstrip("=")


def push_enabled() -> bool:
    """Push needs a parseable private key matching the public one and a ``mailto:``/``https:``
    subject; anything else disables the channel and the endpoints (503) instead of failing per
    send."""
    public, private = vapid_public_key(), vapid_private_key()
    return bool(public and private and _subject_ok(vapid_subject()) and _keys_ok(public, private))


_HOST_PATTERN = re.compile(r"(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}")


def endpoint_hosts() -> Sequence[str]:
    """The configured allowlist; empty, junk-only or mistyped values fall back to the defaults
    (an empty list would silently reject every browser)."""
    raw = getattr(settings, "NOTIFICATIONS_PUSH_ENDPOINT_HOSTS", None)
    if isinstance(raw, str):
        raw = raw.split(",")
    hosts = tuple(
        host
        for host in (str(item).strip().lower() for item in raw or ())
        if _HOST_PATTERN.fullmatch(host)
    )
    return hosts or DEFAULT_ENDPOINT_HOSTS


def push_timeout() -> tuple[float, float]:
    """``(connect, read)`` seconds per push request: a dead service must not stall the tick."""
    return (3, 2)


def push_budget_seconds() -> float:
    """Wall-clock cap for all the sends of one reminder (keeps the tick channel fast)."""
    return float(getattr(settings, "NOTIFICATIONS_PUSH_BUDGET_SECONDS", 10))
