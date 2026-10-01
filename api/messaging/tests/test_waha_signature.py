"""WAHA webhook HMAC (docs: how-to/events, "HMAC authentication" worked example)."""

from messaging.waha.signature import verify_signature

# Vector published in the WAHA docs (how-to/events): sha512, key ``my-secret-key``.
DOC_BODY = b'{"event":"message","session":"default","engine":"WEBJS"}'
DOC_KEY = "my-secret-key"
DOC_HMAC = (
    "208f8a55dde9e05519e898b10b89bf0d0b3b0fdf11fdbf09b6b90476301b98d"
    "8097c462b2b17a6ce93b6b47a136cf2e78a33a63f6752c2c1631777076153fa89"
)


def test_documented_vector_verifies():
    assert verify_signature(DOC_BODY, DOC_HMAC, DOC_KEY) is True


def test_uppercase_hex_and_whitespace_are_tolerated():
    assert verify_signature(DOC_BODY, f" {DOC_HMAC.upper()} ", DOC_KEY) is True


def test_wrong_key_or_tampered_body_fails():
    assert verify_signature(DOC_BODY, DOC_HMAC, "other") is False
    assert verify_signature(DOC_BODY + b" ", DOC_HMAC, DOC_KEY) is False


def test_fails_closed_without_key_or_header():
    assert verify_signature(DOC_BODY, DOC_HMAC, "") is False
    assert verify_signature(DOC_BODY, None, DOC_KEY) is False
    assert verify_signature(DOC_BODY, "", DOC_KEY) is False


def test_non_ascii_header_does_not_raise():
    assert verify_signature(DOC_BODY, "ñandú", DOC_KEY) is False
