from dataclasses import dataclass
from datetime import timedelta

from identity import domain
from identity.domain import OtpConfig, RateLimitedError
from identity.ports import EligibilityChecker, MessageSender, OtpChallengeRepository
from shared.clock import Clock


@dataclass(frozen=True)
class OtpRequested:
    retry_after_seconds: int
    expires_in_seconds: int


def request_otp(
    phone: str,
    ip: str,
    clock: Clock,
    *,
    repo: OtpChallengeRepository,
    eligibility: EligibilityChecker,
    sender: MessageSender,
    config: OtpConfig,
) -> OtpRequested:
    """Create a challenge and, only for eligible phones, hand the code to the sender.

    The outcome is identical for eligible and ineligible phones (anti-enumeration): a challenge
    row is always stored and the caller always gets ``OtpRequested``.

    Raises ``InvalidPhoneError`` and ``RateLimitedError``.
    """
    normalized = domain.normalize_phone(phone)
    now = clock.now()
    since = now - timedelta(hours=1)
    retry_after = domain.rate_limit_retry_after(
        now,
        repo.created_times(since, phone=normalized),
        repo.created_times(since, ip=ip) if ip else [],
        repo.created_times(since),
        config.limits,
    )
    if retry_after is not None:
        raise RateLimitedError(retry_after)

    eligible = eligibility.is_eligible(normalized)
    code = domain.generate_code()
    repo.add_replacing_live(
        phone=normalized,
        code_hmac=domain.hash_code(normalized, code, config.pepper),
        expires_at=now + timedelta(seconds=config.ttl_seconds),
        max_attempts=config.max_attempts,
        ip=ip,
        eligible=eligible,
        now=now,
    )
    if eligible:
        sender.send_otp(normalized, code, config.ttl_seconds)
    return OtpRequested(config.cooldown_seconds, config.ttl_seconds)
