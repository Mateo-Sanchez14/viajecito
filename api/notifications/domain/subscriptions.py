"""Pure validation of a browser push subscription, including the endpoint SSRF guard.

The api later POSTs to ``endpoint``, so only https endpoints on the well-known push services
(no userinfo, default port) are accepted; the sender re-checks before every send.
"""

import base64
import binascii
import re
from collections.abc import Iterable
from dataclasses import dataclass
from urllib.parse import urlsplit

DEFAULT_ENDPOINT_HOSTS = (
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "push.services.mozilla.com",
    "*.push.apple.com",
    "*.notify.windows.com",
)

MAX_ENDPOINT_CHARS = 1000
MAX_USER_AGENT_CHARS = 300
P256DH_BYTES = 65  # uncompressed P-256 point
AUTH_BYTES = 16

_B64URL = re.compile(r"[A-Za-z0-9_-]+={0,2}")


class InvalidSubscriptionError(ValueError):
    """The subscription is malformed or points somewhere push is not allowed to go."""


@dataclass(frozen=True)
class ValidSubscription:
    endpoint: str
    host: str
    p256dh: str
    auth: str
    user_agent: str


def host_allowed(host: str, patterns: Iterable[str]) -> bool:
    """Exact host, or ``*.suffix`` for one or more whole labels in front of the suffix."""
    for pattern in patterns:
        pattern = pattern.strip().lower()
        if pattern.startswith("*."):
            if host.endswith(pattern[1:]) and len(host) > len(pattern) - 1:
                return True
        elif host == pattern:
            return True
    return False


def endpoint_host(endpoint: str, allowed_hosts: Iterable[str]) -> str:
    """The normalized host of an allowed endpoint; raises ``InvalidSubscriptionError`` otherwise."""
    if not endpoint or len(endpoint) > MAX_ENDPOINT_CHARS or re.search(r"\s", endpoint):
        raise InvalidSubscriptionError("endpoint is empty, too long or contains whitespace")
    try:
        parts = urlsplit(endpoint)
        port = parts.port
    except ValueError as exc:
        raise InvalidSubscriptionError("endpoint is not a valid URL") from exc
    if parts.scheme != "https":
        raise InvalidSubscriptionError("endpoint must be https")
    if parts.username is not None or parts.password is not None or "@" in parts.netloc:
        raise InvalidSubscriptionError("endpoint must not carry credentials")
    if port not in (None, 443):
        raise InvalidSubscriptionError("endpoint must use the default port")
    host = (parts.hostname or "").lower().rstrip(".")
    if not host_allowed(host, allowed_hosts):
        raise InvalidSubscriptionError("endpoint host is not an allowed push service")
    return host


def _key(value: str, expected_len: int, name: str, first_byte: int | None = None) -> str:
    if not value or not _B64URL.fullmatch(value) or len(value) > 200:
        raise InvalidSubscriptionError(f"{name} is not base64url")
    stripped = value.rstrip("=")
    try:
        raw = base64.urlsafe_b64decode(stripped + "=" * (-len(stripped) % 4))
    except (binascii.Error, ValueError) as exc:
        raise InvalidSubscriptionError(f"{name} is not base64url") from exc
    if len(raw) != expected_len or (first_byte is not None and raw[0] != first_byte):
        raise InvalidSubscriptionError(f"{name} has the wrong length or format")
    return stripped


def validate_subscription(
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str,
    allowed_hosts: Iterable[str],
) -> ValidSubscription:
    host = endpoint_host(endpoint, allowed_hosts)
    return ValidSubscription(
        endpoint=endpoint,
        host=host,
        p256dh=_key(p256dh, P256DH_BYTES, "p256dh", first_byte=4),
        auth=_key(auth, AUTH_BYTES, "auth"),
        user_agent=user_agent[:MAX_USER_AGENT_CHARS],
    )


class RateLimitedError(Exception):
    """Too many new subscriptions registered by one person in the last hour."""

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("rate limited")
        self.retry_after_seconds = retry_after_seconds
