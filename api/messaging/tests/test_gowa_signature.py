import hashlib
import hmac

import pytest

from messaging.gowa.signature import verify_signature

SECRET = "s3cret"
BODY = b'{"event":"message"}'


def sign(body: bytes = BODY, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_valid_signature_with_prefix():
    assert verify_signature(BODY, f"sha256={sign()}", SECRET) is True


def test_prefix_is_optional():
    assert verify_signature(BODY, sign(), SECRET) is True


@pytest.mark.parametrize("header", [None, "", "sha256=", "sha256=deadbeef", "nonsense"])
def test_missing_or_invalid_header_fails(header):
    assert verify_signature(BODY, header, SECRET) is False


def test_tampered_body_fails():
    assert verify_signature(BODY + b" ", f"sha256={sign()}", SECRET) is False


def test_wrong_secret_fails():
    assert verify_signature(BODY, f"sha256={sign(secret='other')}", SECRET) is False


def test_empty_secret_fails_closed_even_with_a_matching_signature():
    assert verify_signature(BODY, f"sha256={sign(secret='')}", "") is False
