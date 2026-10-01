import base64
import json
import logging
from datetime import UTC, datetime

import pytest
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from py_vapid import Vapid
from pywebpush import WebPushException

from notifications.adapters import webpush_sender
from notifications.adapters.webpush_sender import NoRedirectSession, WebPushSender
from notifications.ports import SubscriptionData

PRIVATE = "super-secret-vapid-private-key"
SUBJECT = "mailto:owner@example.test"


def subscription(endpoint="https://fcm.googleapis.com/fcm/send/abc") -> SubscriptionData:
    return SubscriptionData(
        id="s1",
        person_id="p1",
        endpoint=endpoint,
        p256dh="P" * 20,
        auth="A" * 22,
        failure_count=0,
        created_at=datetime(2026, 10, 1, tzinfo=UTC),
    )


def response(status: int) -> requests.Response:
    resp = requests.Response()
    resp.status_code = status
    return resp


class FakeWebpush(list):
    """Records ``webpush`` keyword arguments; set ``outcome`` to an exception to raise it."""

    outcome: Exception | None = None

    def __call__(self, **kwargs):
        self.append(kwargs)
        if self.outcome is not None:
            raise self.outcome
        return response(201)


@pytest.fixture
def calls(monkeypatch):
    fake = FakeWebpush()
    monkeypatch.setattr(webpush_sender, "webpush", fake)
    return fake


def sender() -> WebPushSender:
    return WebPushSender(private_key=PRIVATE, subject=SUBJECT, timeout=5)


def test_webpush_is_called_with_vapid_ttl_timeout_and_urgency(calls):
    result = sender().send(subscription(), '{"title":"hi"}')
    assert result.outcome == "ok"
    (call,) = calls
    assert call["subscription_info"] == {
        "endpoint": "https://fcm.googleapis.com/fcm/send/abc",
        "keys": {"p256dh": "P" * 20, "auth": "A" * 22},
    }
    assert call["data"] == '{"title":"hi"}'
    assert call["vapid_private_key"] == PRIVATE
    assert call["vapid_claims"] == {"sub": SUBJECT}
    assert call["ttl"] == 43200
    assert call["timeout"] == 5
    assert call["headers"] == {"Urgency": "normal"}
    assert isinstance(call["requests_session"], NoRedirectSession)


def test_each_send_gets_its_own_claims_dict(calls):
    sender().send(subscription(), "x")
    sender().send(subscription(), "x")
    assert calls[0]["vapid_claims"] is not calls[1]["vapid_claims"]  # webpush() mutates it


@pytest.mark.parametrize(
    ("status", "outcome"),
    [(404, "gone"), (410, "gone"), (500, "error"), (429, "error"), (403, "error")],
)
def test_push_service_statuses_map_to_outcomes(calls, status, outcome):
    calls.outcome = WebPushException("boom", response=response(status))
    assert sender().send(subscription(), "x").outcome == outcome


@pytest.mark.parametrize(
    "failure",
    [
        WebPushException("no response"),
        requests.ConnectionError("down"),
        requests.Timeout("slow"),
        ValueError("bad key"),
    ],
)
def test_failures_without_a_status_are_plain_errors(calls, failure):
    calls.outcome = failure
    assert sender().send(subscription(), "x").outcome == "error"


def test_logs_never_contain_the_private_key(calls, caplog):
    calls.outcome = ValueError(f"could not load {PRIVATE}")
    with caplog.at_level(logging.DEBUG):
        sender().send(subscription(), "x")
    assert PRIVATE not in caplog.text


def test_redirects_are_never_followed():
    assert NoRedirectSession().get_redirect_target(response(307)) is None


def test_the_real_library_signs_and_sends_a_well_formed_request(monkeypatch):
    """No fake ``webpush``: pywebpush encrypts for a real P-256 key, signs with a real VAPID key
    and the (stubbed) transport sees the headers the push services require."""
    vapid = Vapid()
    vapid.generate_keys()
    private = (
        base64.urlsafe_b64encode(
            vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
        )
        .decode()
        .rstrip("=")
    )
    receiver = ec.generate_private_key(ec.SECP256R1())
    p256dh = (
        base64.urlsafe_b64encode(
            receiver.public_key().public_bytes(
                serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
            )
        )
        .decode()
        .rstrip("=")
    )
    seen: list[requests.PreparedRequest] = []

    def fake_send(self, request, **kwargs):
        seen.append(request)
        return response(410)

    monkeypatch.setattr(NoRedirectSession, "send", fake_send)
    real = WebPushSender(private_key=private, subject=SUBJECT, timeout=3)
    sub = SubscriptionData(
        id="s1",
        person_id="p1",
        endpoint="https://fcm.googleapis.com/fcm/send/real",
        p256dh=p256dh,
        auth=base64.urlsafe_b64encode(b"\x07" * 16).decode().rstrip("="),
        failure_count=0,
        created_at=datetime(2026, 10, 1, tzinfo=UTC),
    )
    assert real.send(sub, json.dumps({"title": "x"})).outcome == "gone"
    (request,) = seen
    assert request.url == sub.endpoint
    assert request.headers["TTL"] == "43200"
    assert request.headers["Urgency"] == "normal"
    assert request.headers["Content-Encoding"] == "aes128gcm"
    assert request.headers["Authorization"].startswith("vapid ")
