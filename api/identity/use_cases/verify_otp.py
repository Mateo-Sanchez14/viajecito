from identity import domain
from identity.domain import AttemptOutcome, OtpConfig, OtpVerificationError, PersonData
from identity.ports import InviteAcceptor, OtpChallengeRepository, PersonProvisioner
from shared.clock import Clock

_ERROR_CODES = {
    AttemptOutcome.INVALID: "invalid_code",
    AttemptOutcome.USED: "invalid_code",
    AttemptOutcome.EXPIRED: "expired_code",
    AttemptOutcome.LOCKED: "too_many_attempts",
}


def verify_otp(
    phone: str,
    code: str,
    clock: Clock,
    *,
    repo: OtpChallengeRepository,
    persons: PersonProvisioner,
    invites: InviteAcceptor,
    config: OtpConfig,
) -> PersonData:
    """Check a code and return the (possibly just created) person.

    Raises ``InvalidPhoneError`` and ``OtpVerificationError``. The attempt is reserved (persisted)
    before the comparison, so callers must not wrap this in a transaction that rolls back on
    exceptions. The 6th attempt (and any later one) answers ``too_many_attempts``.
    """
    normalized = domain.normalize_phone(phone)
    live = repo.latest_live(normalized)
    if live is None:
        raise OtpVerificationError("invalid_code")
    challenge_id, state = live
    now = clock.now()
    # Cheap pre-checks on the (possibly stale) snapshot: expiry and an already-exhausted limit.
    if state.consumed_at is not None:
        raise OtpVerificationError("invalid_code")
    if state.attempts >= state.max_attempts:
        raise OtpVerificationError("too_many_attempts")
    if now >= state.expires_at:
        raise OtpVerificationError("expired_code")
    # Reserve the attempt BEFORE comparing, with a guarded update, so parallel verifications can
    # never perform more than ``max_attempts`` comparisons in total.
    if not repo.reserve_attempt(challenge_id):
        raise OtpVerificationError("too_many_attempts")
    result = domain.check_attempt(state, phone=normalized, code=code, pepper=config.pepper, now=now)
    if result.outcome is not AttemptOutcome.OK:
        raise OtpVerificationError(_ERROR_CODES[result.outcome])
    if not repo.consume(challenge_id, now):
        raise OtpVerificationError("invalid_code")  # lost a race: the code was already used
    person = persons.get_or_create(normalized)
    invites.accept(person.id, normalized)
    return person
