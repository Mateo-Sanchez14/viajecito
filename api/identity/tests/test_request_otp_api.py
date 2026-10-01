from datetime import UTC, datetime, timedelta

import httpx
import pytest
import time_machine

from identity.models import OtpChallenge
from identity.tests.conftest import MEMBER_PHONE, STRANGER_PHONE, post_json, request_otp
from messaging.models import OutboundMessage

BODY = {"status": "sent", "retry_after_seconds": 60, "expires_in_seconds": 300}
T0 = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)

pytestmark = pytest.mark.django_db


def test_eligible_member_gets_202_and_a_whatsapp_message(client, member, gowa):
    response = request_otp(client, "011 15 5555 1234")
    assert response.status_code == 202
    assert response.json() == BODY
    assert gowa.recipients() == ["5491155551234@s.whatsapp.net"]
    assert len(gowa.codes()) == 1


def test_response_is_identical_for_ineligible_phone_and_nothing_is_sent(client, member, gowa):
    eligible = request_otp(client, MEMBER_PHONE)
    stranger = request_otp(client, STRANGER_PHONE)
    assert stranger.status_code == eligible.status_code == 202
    assert stranger.json() == eligible.json() == BODY
    assert gowa.call_count == 1  # only the member was messaged


def test_challenge_row_is_created_for_both_with_eligibility_flag(client, member, gowa):
    request_otp(client, MEMBER_PHONE)
    request_otp(client, STRANGER_PHONE)
    flags = dict(OtpChallenge.objects.values_list("phone", "eligible"))
    assert flags == {MEMBER_PHONE: True, STRANGER_PHONE: False}


def test_pending_invite_makes_a_phone_eligible(client, invite, gowa):
    request_otp(client, STRANGER_PHONE)
    assert gowa.call_count == 1
    assert OtpChallenge.objects.get().eligible is True


def test_only_the_hmac_of_the_code_is_stored(client, member, gowa):
    request_otp(client, MEMBER_PHONE)
    challenge = OtpChallenge.objects.get()
    code = gowa.codes()[0]
    assert code not in challenge.code_hmac
    assert len(challenge.code_hmac) == 64
    assert challenge.max_attempts == 5 and challenge.attempts == 0
    assert (challenge.expires_at - challenge.created_at).total_seconds() == 300


def test_outbound_ledger_row_is_redacted(client, member, gowa):
    request_otp(client, MEMBER_PHONE)
    row = OutboundMessage.objects.get()
    assert (row.kind, row.body, row.status) == ("otp", "<redacted>", "sent")
    assert gowa.codes()[0] not in row.body


def test_message_copy_is_spanish_voseo(client, member, gowa):
    request_otp(client, MEMBER_PHONE)
    import json

    message = json.loads(gowa.calls.last.request.content)["message"]
    assert message.startswith("Tu código de viajecito es ")
    assert "Vence en 5 minutos" in message and "ignorá" in message


def test_gowa_failure_is_recorded_and_never_surfaced(client, member, gowa):
    gowa.mock(return_value=httpx.Response(500))
    response = request_otp(client, MEMBER_PHONE)
    assert response.status_code == 202 and response.json() == BODY
    assert OutboundMessage.objects.get().status == "failed"


def test_new_request_invalidates_the_previous_live_challenge(client, member, gowa):
    with time_machine.travel(T0, tick=False):
        request_otp(client, MEMBER_PHONE)
    with time_machine.travel(T0 + timedelta(seconds=61), tick=False):
        request_otp(client, MEMBER_PHONE)
    first, second = OtpChallenge.objects.order_by("created_at")
    assert first.consumed_at is not None and second.consumed_at is None


@pytest.mark.parametrize("payload", [{"phone": "nope"}, {"phone": ""}, {}, {"phone": 12}])
def test_invalid_phone_is_400(client, payload):
    response = post_json(client, "/api/auth/otp/request", payload)
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_phone"
    assert set(response.json()) == {"code", "message"}
    assert OtpChallenge.objects.count() == 0


def test_503_when_delivery_is_disabled(client, member, gowa, settings):
    settings.OTP_DELIVERY_ENABLED = False
    response = request_otp(client, MEMBER_PHONE)
    assert response.status_code == 503
    assert response.json()["code"] == "delivery_unavailable"
    assert OtpChallenge.objects.count() == 0 and gowa.call_count == 0


def test_per_phone_cooldown_returns_429_with_retry_after(client, member, gowa):
    with time_machine.travel(T0, tick=False):
        assert request_otp(client, MEMBER_PHONE).status_code == 202
    with time_machine.travel(T0 + timedelta(seconds=20), tick=False):
        response = request_otp(client, MEMBER_PHONE)
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"
    assert response["Retry-After"] == "40"
    with time_machine.travel(T0 + timedelta(seconds=61), tick=False):
        assert request_otp(client, MEMBER_PHONE).status_code == 202


def test_per_phone_hourly_limit(client, member, gowa):
    for i in range(5):
        with time_machine.travel(T0 + timedelta(seconds=61 * i), tick=False):
            assert request_otp(client, MEMBER_PHONE).status_code == 202
    with time_machine.travel(T0 + timedelta(seconds=61 * 5), tick=False):
        response = request_otp(client, MEMBER_PHONE)
    assert response.status_code == 429
    assert int(response["Retry-After"]) == 3600 - 61 * 5


def phone_n(n):
    return f"+549115555{n:04d}"


def test_per_ip_limit_uses_cf_connecting_ip(client, gowa, settings):
    settings.TRUST_CF_CONNECTING_IP = True
    with time_machine.travel(T0, tick=False):
        for n in range(10):
            response = request_otp(client, phone_n(n), HTTP_CF_CONNECTING_IP="203.0.113.7")
            assert response.status_code == 202
        blocked = request_otp(client, phone_n(10), HTTP_CF_CONNECTING_IP="203.0.113.7")
        other_ip = request_otp(client, phone_n(10), HTTP_CF_CONNECTING_IP="203.0.113.8")
    assert blocked.status_code == 429 and blocked["Retry-After"] == "3600"
    assert other_ip.status_code == 202
    assert OtpChallenge.objects.filter(ip="203.0.113.7").count() == 10


def test_cf_connecting_ip_is_ignored_unless_trusted(client, gowa, settings):
    assert settings.TRUST_CF_CONNECTING_IP is False  # default outside prod
    request_otp(client, phone_n(1), HTTP_CF_CONNECTING_IP="203.0.113.7", REMOTE_ADDR="198.51.100.9")
    assert OtpChallenge.objects.get().ip == "198.51.100.9"


def test_trusted_cf_connecting_ip_wins_over_remote_addr(client, gowa, settings):
    settings.TRUST_CF_CONNECTING_IP = True
    request_otp(client, phone_n(1), HTTP_CF_CONNECTING_IP="203.0.113.7", REMOTE_ADDR="198.51.100.9")
    assert OtpChallenge.objects.get().ip == "203.0.113.7"


def test_ip_falls_back_to_remote_addr(client, gowa, settings):
    settings.TRUST_CF_CONNECTING_IP = True
    request_otp(client, phone_n(1), REMOTE_ADDR="198.51.100.9")
    assert OtpChallenge.objects.get().ip == "198.51.100.9"


def test_global_limit(client, gowa, settings):
    settings.TRUST_CF_CONNECTING_IP = True
    with time_machine.travel(T0, tick=False):
        for n in range(30):
            response = request_otp(client, phone_n(n), HTTP_CF_CONNECTING_IP=f"203.0.113.{n}")
            assert response.status_code == 202
        blocked = request_otp(client, phone_n(30), HTTP_CF_CONNECTING_IP="203.0.113.99")
    assert blocked.status_code == 429 and blocked.json()["code"] == "rate_limited"


def test_csrf_is_required(strict_client, member, gowa):
    denied = request_otp(strict_client, MEMBER_PHONE)
    assert denied.status_code == 403
    assert denied.json()["code"] == "csrf_failed"
    assert OtpChallenge.objects.count() == 0
    token = strict_client.get("/api/auth/csrf").json()["csrf_token"]
    allowed = request_otp(strict_client, MEMBER_PHONE, HTTP_X_CSRFTOKEN=token)
    assert allowed.status_code == 202


def test_csrf_endpoint_returns_token_and_sets_cookie(client):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    token = response.json()["csrf_token"]
    assert token and "csrftoken" in response.cookies


def test_delivery_runs_off_the_request_path_after_commit(
    client, member, gowa, settings, monkeypatch, django_capture_on_commit_callbacks
):
    from identity.adapters import otp_sender

    submitted = []

    class InlinePool:
        def submit(self, fn, *args):
            submitted.append(fn)
            fn(*args)

    monkeypatch.setattr(otp_sender, "_executor", InlinePool())
    settings.OTP_SEND_SYNC = False
    with django_capture_on_commit_callbacks(execute=False) as callbacks:
        response = request_otp(client, MEMBER_PHONE)
    assert response.status_code == 202
    assert gowa.call_count == 0 and submitted == []  # nothing sent on the request path
    for callback in callbacks:
        callback()
    assert len(submitted) == 1 and gowa.call_count == 1


def test_csrf_is_checked_before_body_validation(strict_client):
    response = post_json(strict_client, "/api/auth/otp/request", {"nope": 1})
    assert response.status_code == 403 and response.json()["code"] == "csrf_failed"
