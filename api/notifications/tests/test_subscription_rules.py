import base64

import pytest

from notifications.domain.subscriptions import (
    DEFAULT_ENDPOINT_HOSTS,
    InvalidSubscriptionError,
    validate_subscription,
)


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


P256DH = b64(b"\x04" + b"\x01" * 64)
AUTH = b64(b"\x02" * 16)
FCM = "https://fcm.googleapis.com/fcm/send/abc123"


def check(endpoint=FCM, p256dh=P256DH, auth=AUTH, user_agent="UA", hosts=DEFAULT_ENDPOINT_HOSTS):
    return validate_subscription(endpoint, p256dh, auth, user_agent, hosts)


def test_a_well_formed_subscription_is_accepted_and_normalized():
    ok = check(endpoint="https://FCM.googleapis.com/fcm/send/abc", user_agent="x" * 500)
    assert ok.endpoint == "https://FCM.googleapis.com/fcm/send/abc"
    assert ok.host == "fcm.googleapis.com"
    assert len(ok.user_agent) == 300


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://fcm.googleapis.com/fcm/send/abc",  # not https
        "https://user:pw@fcm.googleapis.com/x",  # userinfo
        "https://fcm.googleapis.com:8443/x",  # non-default port
        "https://evil.example/fcm",  # host not allow-listed
        "https://fcm.googleapis.com.evil.example/x",  # suffix trick
        "https://push.apple.com/x",  # wildcard needs a subdomain
        "https://notpush.apple.com/x",  # wildcard must match a whole label
        "https://127.0.0.1/x",
        "https://localhost/x",
        "ftp://fcm.googleapis.com/x",
        "fcm.googleapis.com/x",
        "",
        "https://fcm.googleapis.com/" + "a" * 1000,  # too long
        "https://fcm.googleapis.com/a b",  # whitespace
    ],
)
def test_endpoints_outside_the_ssrf_guard_are_rejected(endpoint):
    with pytest.raises(InvalidSubscriptionError):
        check(endpoint=endpoint)


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "https://push.services.mozilla.com/x",
        "https://web.push.apple.com/abc",
        "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ],
)
def test_the_default_allowlist_covers_the_major_push_services(endpoint):
    assert check(endpoint=endpoint).endpoint == endpoint


def test_the_allowlist_is_configurable():
    assert check(endpoint="https://push.example.test/x", hosts=("push.example.test",)).host
    with pytest.raises(InvalidSubscriptionError):
        check(hosts=("push.example.test",))


@pytest.mark.parametrize(
    ("p256dh", "auth"),
    [
        ("not base64!", AUTH),
        (b64(b"\x04" + b"\x01" * 10), AUTH),  # wrong length
        (b64(b"\x05" + b"\x01" * 64), AUTH),  # not an uncompressed point
        (P256DH, "***"),
        (P256DH, b64(b"\x02" * 8)),  # wrong auth length
        (P256DH.replace("A", "+") + "+", AUTH),  # standard base64 alphabet
        ("", AUTH),
        (P256DH, ""),
    ],
)
def test_bad_keys_are_rejected(p256dh, auth):
    with pytest.raises(InvalidSubscriptionError):
        check(p256dh=p256dh, auth=auth)


def test_padded_base64url_is_tolerated():
    padded = base64.urlsafe_b64encode(b"\x02" * 16).decode()
    assert check(auth=padded).auth == AUTH
