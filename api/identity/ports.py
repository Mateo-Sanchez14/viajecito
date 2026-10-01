"""Ports of the identity app. Adapters live in ``identity/adapters``."""

from collections.abc import Callable
from datetime import datetime
from typing import Protocol

from crews.domain import CrewSummary
from identity.domain import OtpState, PersonData


class OtpChallengeRepository(Protocol):
    def created_times(
        self, since: datetime, *, phone: str | None = None, ip: str | None = None
    ) -> list[datetime]:
        """``created_at`` of challenges since ``since``, optionally scoped to a phone or an IP."""
        ...

    def add_replacing_live(
        self,
        *,
        phone: str,
        code_hmac: str,
        expires_at: datetime,
        max_attempts: int,
        ip: str,
        eligible: bool,
        now: datetime,
    ) -> None:
        """Invalidate the phone's live challenge(s) and store the new one, atomically."""
        ...

    def latest_live(self, phone: str) -> tuple[int, OtpState] | None: ...

    def reserve_attempt(self, challenge_id: int) -> bool:
        """Atomically count one attempt if the challenge is live and under its limit."""
        ...

    def consume(self, challenge_id: int, now: datetime) -> bool:
        """Mark the challenge used; ``False`` if somebody else already did."""
        ...


class EligibilityChecker(Protocol):
    def is_eligible(self, phone: str) -> bool: ...


class MessageSender(Protocol):
    def send_otp(self, phone: str, code: str, expires_in_seconds: int) -> None:
        """Deliver the code. Must not raise for delivery failures."""
        ...


class PersonProvisioner(Protocol):
    def get_or_create(self, phone: str) -> PersonData: ...


class InviteAcceptor(Protocol):
    def accept(self, person_id: str, phone: str) -> int: ...


class CrewLister(Protocol):
    def crews_for(self, person_id: str) -> list[CrewSummary]: ...


class IdentityDirectory(Protocol):
    def person_id_by_jid(self, jid: str) -> str | None: ...

    def person_id_by_lid(self, lid: str) -> str | None: ...

    def people_by_ids(self, person_ids: list[str]) -> list[PersonData]: ...


_default_directory: Callable[[], IdentityDirectory] | None = None


def set_default_directory(factory: Callable[[], IdentityDirectory]) -> None:
    """Composition root hook: ``IdentityConfig.ready()`` installs the Django directory here."""
    global _default_directory
    _default_directory = factory


def default_directory() -> IdentityDirectory:
    if _default_directory is None:
        raise RuntimeError("no default identity directory configured (is identity installed?)")
    return _default_directory()
