from datetime import UTC, datetime

import pytest

from identity.adapters.django_repos import DjangoOtpChallengeRepository
from identity.domain import InvalidPhoneError, OtpConfig, RateLimitedError
from identity.use_cases.request_otp import request_otp
from shared.clock import FrozenClock

pytestmark = pytest.mark.django_db

CLOCK = FrozenClock(datetime(2026, 10, 1, 12, 0, tzinfo=UTC))


class FakeSender:
    def __init__(self):
        self.sent = []

    def send_otp(self, phone, code, expires_in_seconds):
        self.sent.append((phone, code, expires_in_seconds))


class FakeEligibility:
    def __init__(self, eligible):
        self.eligible = eligible

    def is_eligible(self, phone):
        return self.eligible


def call(phone, *, eligible, sender, ip="1.1.1.1"):
    return request_otp(
        phone,
        ip,
        CLOCK,
        repo=DjangoOtpChallengeRepository(),
        eligibility=FakeEligibility(eligible),
        sender=sender,
        config=OtpConfig(pepper="p"),
    )


def test_eligible_phone_gets_a_six_digit_code_through_the_sender():
    sender = FakeSender()
    result = call("+5491155551234", eligible=True, sender=sender)
    assert (result.retry_after_seconds, result.expires_in_seconds) == (60, 300)
    [(phone, code, ttl)] = sender.sent
    assert phone == "+5491155551234" and len(code) == 6 and code.isdigit() and ttl == 300


def test_ineligible_phone_is_not_sent_anything_but_gets_the_same_result():
    sender = FakeSender()
    assert call("+5491155551234", eligible=False, sender=sender) == call(
        "+5491155559999", eligible=True, sender=FakeSender()
    )
    assert sender.sent == []


def test_invalid_phone_raises():
    with pytest.raises(InvalidPhoneError):
        call("nope", eligible=True, sender=FakeSender())


def test_second_request_inside_cooldown_is_rate_limited():
    call("+5491155551234", eligible=True, sender=FakeSender())
    with pytest.raises(RateLimitedError) as info:
        call("+5491155551234", eligible=True, sender=FakeSender())
    assert info.value.retry_after_seconds == 60
