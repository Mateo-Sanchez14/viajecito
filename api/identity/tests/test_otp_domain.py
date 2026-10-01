import hmac
import re
from datetime import UTC, datetime, timedelta

import time_machine

from identity import domain
from identity.domain import AttemptOutcome, OtpState

PEPPER = "test-pepper"
PHONE = "+5491155551234"
T0 = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)


def make_state(code="123456", *, now=T0, ttl=300, attempts=0, max_attempts=5, eligible=True):
    return OtpState(
        code_hmac=domain.hash_code(PHONE, code, PEPPER),
        expires_at=now + timedelta(seconds=ttl),
        attempts=attempts,
        max_attempts=max_attempts,
        consumed_at=None,
        eligible=eligible,
    )


def attempt(state, code, *, now=T0):
    return domain.check_attempt(state, phone=PHONE, code=code, pepper=PEPPER, now=now)


def test_generated_codes_are_six_digits_zero_padded():
    codes = {domain.generate_code() for _ in range(200)}
    assert all(re.fullmatch(r"\d{6}", code) for code in codes)


def test_zero_padding(monkeypatch):
    monkeypatch.setattr(domain.secrets, "randbelow", lambda _: 42)
    assert domain.generate_code() == "000042"


def test_hash_is_hmac_sha256_over_phone_and_code_and_not_the_code():
    digest = domain.hash_code(PHONE, "123456", PEPPER)
    expected = hmac.new(PEPPER.encode(), f"{PHONE}:123456".encode(), "sha256").hexdigest()
    assert digest == expected
    assert "123456" not in digest


def test_hash_depends_on_pepper_and_phone():
    base = domain.hash_code(PHONE, "123456", PEPPER)
    assert base != domain.hash_code(PHONE, "123456", "other-pepper")
    assert base != domain.hash_code("+5491155559999", "123456", PEPPER)


def test_correct_code_is_ok():
    assert attempt(make_state(), "123456").outcome is AttemptOutcome.OK


def test_wrong_code_increments_attempts():
    result = attempt(make_state(attempts=1), "000000")
    assert result.outcome is AttemptOutcome.INVALID
    assert result.attempts == 2


def test_comparison_is_constant_time(monkeypatch):
    calls = []
    real = hmac.compare_digest

    def spy(a, b):
        calls.append((a, b))
        return real(a, b)

    monkeypatch.setattr(domain.hmac, "compare_digest", spy)
    attempt(make_state(), "123456")
    assert len(calls) == 1


def test_expires_exactly_at_ttl():
    state = make_state(ttl=300)
    assert attempt(state, "123456", now=T0 + timedelta(seconds=299)).outcome is AttemptOutcome.OK
    assert (
        attempt(state, "123456", now=T0 + timedelta(seconds=300)).outcome is AttemptOutcome.EXPIRED
    )


def test_expiry_with_time_machine():
    state = make_state()
    with time_machine.travel(T0 + timedelta(seconds=301), tick=False):
        assert attempt(state, "123456", now=datetime.now(UTC)).outcome is AttemptOutcome.EXPIRED


def test_locks_after_max_attempts_even_with_correct_code():
    state = make_state(attempts=5, max_attempts=5)
    assert attempt(state, "123456").outcome is AttemptOutcome.LOCKED


def test_fifth_wrong_attempt_reaches_the_limit():
    state = make_state(attempts=4)
    result = attempt(state, "000000")
    assert result.outcome is AttemptOutcome.INVALID and result.attempts == 5


def test_single_use():
    state = make_state()
    used = OtpState(**{**state.__dict__, "consumed_at": T0})
    assert attempt(used, "123456").outcome is AttemptOutcome.USED


def test_ineligible_challenge_never_verifies():
    assert attempt(make_state(eligible=False), "123456").outcome is AttemptOutcome.INVALID


def test_malformed_code_is_invalid():
    assert attempt(make_state(), "12ab56").outcome is AttemptOutcome.INVALID


def test_rate_limit_none_when_under_limits():
    assert domain.rate_limit_retry_after(T0, [], [], []) is None


def test_rate_limit_per_phone_cooldown():
    retry = domain.rate_limit_retry_after(T0 + timedelta(seconds=20), [T0], [], [])
    assert retry == 40


def test_rate_limit_per_phone_hourly():
    times = [T0 - timedelta(minutes=m) for m in (50, 40, 30, 20, 5)]
    retry = domain.rate_limit_retry_after(T0, times, [], [])
    assert retry == 600  # the oldest (50 min ago) leaves the 1 h window in 10 min


def test_rate_limit_per_ip_and_global():
    ten = [T0 - timedelta(minutes=m + 1) for m in range(10)]
    assert domain.rate_limit_retry_after(T0, [], ten, []) == 3000
    thirty = [T0 - timedelta(minutes=m + 1) for m in range(30)]
    assert domain.rate_limit_retry_after(T0, [], [], thirty) == 1800
