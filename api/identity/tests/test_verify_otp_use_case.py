"""The attempt limit must hold even when many verifications read the same stale state."""

from datetime import UTC, datetime, timedelta

import pytest

from identity import domain
from identity.domain import OtpConfig, OtpState, OtpVerificationError, PersonData
from identity.use_cases.verify_otp import verify_otp
from shared.clock import FrozenClock

PHONE = "+5491155551234"
NOW = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
CONFIG = OtpConfig(pepper="p", max_attempts=5)


class StaleRepo:
    """Every caller reads attempts=0 (as if all raced before any increment); reserve is guarded."""

    def __init__(self, code="123456"):
        self.state = OtpState(
            code_hmac=domain.hash_code(PHONE, code, "p"),
            expires_at=NOW + timedelta(minutes=5),
            attempts=0,
            max_attempts=5,
            consumed_at=None,
            eligible=True,
        )
        self.reserved = 0
        self.consumed = False

    def latest_live(self, phone):
        return 1, self.state

    def reserve_attempt(self, challenge_id):
        if self.reserved >= self.state.max_attempts or self.consumed:
            return False
        self.reserved += 1
        return True

    def consume(self, challenge_id, now):
        if self.consumed:
            return False
        self.consumed = True
        return True


class Persons:
    def get_or_create(self, phone):
        return PersonData("id", phone, "", "es-AR")


class Invites:
    def accept(self, person_id, phone):
        return 0


def attempt(repo, code):
    return verify_otp(
        PHONE,
        code,
        FrozenClock(NOW),
        repo=repo,
        persons=Persons(),
        invites=Invites(),
        config=CONFIG,
    )


def test_never_more_than_max_attempts_are_compared_under_stale_reads():
    repo = StaleRepo()
    codes = []
    for _ in range(20):
        with pytest.raises(OtpVerificationError) as info:
            attempt(repo, "000000")
        codes.append(info.value.code)
    assert codes.count("invalid_code") == 5  # only five comparisons ever happened
    assert set(codes[5:]) == {"too_many_attempts"}


def test_correct_code_after_exhausted_reservations_is_rejected():
    repo = StaleRepo()
    for _ in range(5):
        with pytest.raises(OtpVerificationError):
            attempt(repo, "000000")
    with pytest.raises(OtpVerificationError) as info:
        attempt(repo, "123456")
    assert info.value.code == "too_many_attempts"
    assert repo.consumed is False


def test_concurrent_success_consumes_once():
    repo = StaleRepo()
    assert attempt(repo, "123456").phone == PHONE
    with pytest.raises(OtpVerificationError) as info:
        attempt(repo, "123456")  # stale read of the same live challenge
    assert info.value.code in {"invalid_code", "too_many_attempts"}
