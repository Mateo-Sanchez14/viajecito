import base64
from io import StringIO

from cryptography.hazmat.primitives import serialization
from django.core.management import call_command
from py_vapid import Vapid

PUBLIC = "NOTIFICATIONS_VAPID_PUBLIC_KEY"
PRIVATE = "NOTIFICATIONS_VAPID_PRIVATE_KEY"


def generate() -> dict[str, str]:
    out = StringIO()
    call_command("generate_vapid_keys", stdout=out)
    pairs = [line.split("=", 1) for line in out.getvalue().splitlines() if "=" in line]
    return {key: value for key, value in pairs}


def decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def test_prints_a_public_and_private_key_as_env_lines():
    keys = generate()
    assert set(keys) == {PUBLIC, PRIVATE}
    assert len(decode(keys[PUBLIC])) == 65 and decode(keys[PUBLIC])[0] == 4
    assert len(decode(keys[PRIVATE])) == 32


def test_the_public_key_belongs_to_the_private_key():
    keys = generate()
    vapid = Vapid.from_string(keys[PRIVATE])
    derived = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    assert derived == decode(keys[PUBLIC])


def test_every_run_makes_a_new_pair():
    assert generate()[PRIVATE] != generate()[PRIVATE]


def test_the_values_are_safe_for_env_files():
    for value in generate().values():
        assert value.strip("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_") == ""
