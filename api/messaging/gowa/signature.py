"""Verification of Gowa's ``X-Hub-Signature-256`` webhook header."""

import hashlib
import hmac

PREFIX = "sha256="


def verify_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    """Check the HMAC-SHA256 of the raw body. Fails closed: no secret or no valid header → False.

    The ``sha256=`` prefix is optional (some Gowa builds send the bare hex digest).
    """
    if not secret or not header:
        return False
    received = header.strip()
    if received.startswith(PREFIX):
        received = received[len(PREFIX) :]
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode("ascii"), received.encode("utf-8", "replace"))
