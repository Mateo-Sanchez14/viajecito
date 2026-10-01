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

    Raises ``InvalidPhoneError`` and ``OtpVerificationError``. Failed attempts are persisted before
    raising, so callers must not wrap this in a transaction that rolls back on exceptions.
    """
    normalized = domain.normalize_phone(phone)
    live = repo.latest_live(normalized)
    if live is None:
        raise OtpVerificationError("invalid_code")
    challenge_id, state = live
    result = domain.check_attempt(
        state, phone=normalized, code=code, pepper=config.pepper, now=clock.now()
    )
    if result.outcome is AttemptOutcome.INVALID:
        repo.record_failed_attempt(challenge_id)
    if result.outcome is not AttemptOutcome.OK:
        raise OtpVerificationError(_ERROR_CODES[result.outcome])
    if not repo.consume(challenge_id, clock.now()):
        raise OtpVerificationError("invalid_code")  # lost a race: the code was already used
    person = persons.get_or_create(normalized)
    invites.accept(person.id, normalized)
    return person
