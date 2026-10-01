"""Verification of WAHA's ``X-Webhook-Hmac`` header (hex HMAC-SHA512 of the raw body)."""

import hashlib
import hmac

HEADER = "X-Webhook-Hmac"
ALGORITHM_HEADER = "X-Webhook-Hmac-Algorithm"
ALGORITHM = "sha512"


def verify_signature(raw_body: bytes, header: str | None, key: str) -> bool:
    """Fails closed: no key or no header → False."""
    if not key or not header:
        return False
    expected = hmac.new(key.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    received = header.strip().lower()
    return hmac.compare_digest(expected.encode("ascii"), received.encode("utf-8", "replace"))
