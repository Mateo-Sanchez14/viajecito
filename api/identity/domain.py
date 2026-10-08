"""Pure identity rules (no Django, no HTTP): phone normalization, OTP policy, rate limits."""

import hmac
import re
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from math import ceil

from shared.phone import InvalidPhoneError, normalize_phone, phone_to_jid

__all__ = [
    "AttemptOutcome",
    "AttemptResult",
    "MAX_TOUR_VERSION",
    "InvalidPhoneError",
    "InvalidTourVersionError",
    "OtpState",
    "RateLimits",
    "check_attempt",
    "generate_code",
    "hash_code",
    "normalize_phone",
    "phone_to_jid",
    "rate_limit_retry_after",
]

CODE_LENGTH = 6
MAX_TOUR_VERSION = 32767  # PositiveSmallIntegerField upper bound on every backend
_CODE_RE = re.compile(rf"\d{{{CODE_LENGTH}}}")


def generate_code() -> str:
    """Uniform 6-digit code from the OS CSPRNG, zero-padded."""
    return f"{secrets.randbelow(10**CODE_LENGTH):0{CODE_LENGTH}d}"


def hash_code(phone: str, code: str, pepper: str) -> str:
    """HMAC-SHA256 over ``phone:code`` keyed with the server pepper. Only this is stored."""
    return hmac.new(pepper.encode(), f"{phone}:{code}".encode(), "sha256").hexdigest()


class AttemptOutcome(StrEnum):
    OK = "ok"
    INVALID = "invalid"
    EXPIRED = "expired"
    LOCKED = "locked"
    USED = "used"


@dataclass(frozen=True)
class OtpState:
    code_hmac: str
    expires_at: datetime
    attempts: int
    max_attempts: int
    consumed_at: datetime | None
    eligible: bool


@dataclass(frozen=True)
class AttemptResult:
    outcome: AttemptOutcome
    attempts: int


def check_attempt(
    state: OtpState, *, phone: str, code: str, pepper: str, now: datetime
) -> AttemptResult:
    """Judge one verification attempt. Never raises; the caller persists ``attempts``."""
    if state.consumed_at is not None:
        return AttemptResult(AttemptOutcome.USED, state.attempts)
    if state.attempts >= state.max_attempts:
        return AttemptResult(AttemptOutcome.LOCKED, state.attempts)
    if now >= state.expires_at:
        return AttemptResult(AttemptOutcome.EXPIRED, state.attempts)
    candidate = hash_code(phone, code, pepper) if _CODE_RE.fullmatch(code) else ""
    matches = hmac.compare_digest(candidate.encode(), state.code_hmac.encode())
    # An ineligible challenge never received a code, so it can never verify.
    if matches and state.eligible:
        return AttemptResult(AttemptOutcome.OK, state.attempts)
    return AttemptResult(AttemptOutcome.INVALID, state.attempts + 1)


@dataclass(frozen=True)
class RateLimits:
    phone_cooldown_seconds: int = 60
    phone_per_hour: int = 5
    ip_per_hour: int = 10
    global_per_hour: int = 30


HOUR = timedelta(hours=1)


def _retry_after(now: datetime, times: list[datetime], limit: int, window: timedelta) -> int:
    """Seconds until fewer than ``limit`` of ``times`` fall inside ``window``; 0 if under limit."""
    inside = sorted(t for t in times if now - t < window)
    if len(inside) < limit:
        return 0
    # The (len - limit + 1)-th oldest must leave the window before a new one fits.
    blocking = inside[len(inside) - limit]
    return max(1, ceil((blocking + window - now).total_seconds()))


def rate_limit_retry_after(
    now: datetime,
    phone_times: list[datetime],
    ip_times: list[datetime],
    global_times: list[datetime],
    limits: RateLimits = RateLimits(),  # noqa: B008 (frozen dataclass)
) -> int | None:
    """Seconds to wait before another OTP request is allowed, or ``None`` when allowed.

    Each argument lists the ``created_at`` of earlier challenges for that scope.
    """
    waits = [
        _retry_after(now, phone_times, 1, timedelta(seconds=limits.phone_cooldown_seconds)),
        _retry_after(now, phone_times, limits.phone_per_hour, HOUR),
        _retry_after(now, ip_times, limits.ip_per_hour, HOUR),
        _retry_after(now, global_times, limits.global_per_hour, HOUR),
    ]
    longest = max(waits)
    return longest or None


@dataclass(frozen=True)
class OtpConfig:
    pepper: str
    ttl_seconds: int = 300
    max_attempts: int = 5
    limits: RateLimits = field(default_factory=RateLimits)
    cooldown_seconds: int = 60


@dataclass(frozen=True)
class PersonData:
    id: str
    phone: str
    display_name: str
    locale: str
    tour_seen_version: int = 0


class InvalidTourVersionError(ValueError):
    def __init__(self, version: int) -> None:
        super().__init__(f"invalid tour version: {version}")
        self.version = version


class RateLimitedError(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(f"rate limited; retry in {retry_after_seconds}s")
        self.retry_after_seconds = retry_after_seconds


class OtpVerificationError(Exception):
    """Verification failed; ``code`` is the API error code."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code
