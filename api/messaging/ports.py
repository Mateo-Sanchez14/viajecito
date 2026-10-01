"""Ports of the messaging app: what the use cases need from the outside world."""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol

from messaging.domain import GroupMessage, InboundRecord


class GatewayError(Exception):
    """The WhatsApp gateway could not deliver the message."""


@dataclass(frozen=True)
class Participant:
    """A WhatsApp group member as reported by Gowa."""

    jid: str
    phone_number: str | None  # absent when Gowa only knows the LID
    lid: str | None
    display_name: str
    is_admin: bool


class TextGateway(Protocol):
    def send_text(self, to_jid: str, body: str, reply_to: str | None = None) -> str:
        """Send a text message and return the gateway message id. Raises ``GatewayError``."""
        ...


@dataclass(frozen=True)
class LedgerEntry:
    id: int
    created: bool  # False when the dedupe key already existed


class OutboundLedger(Protocol):
    def reserve(
        self,
        *,
        to_jid: str,
        kind: str,
        body: str,
        dedupe_key: str | None,
        reply_to: str | None,
        subject_type: str,
        subject_id: str,
    ) -> LedgerEntry: ...

    def mark_sent(self, entry_id: int, gowa_message_id: str) -> None: ...

    def mark_failed(self, entry_id: int, error: str) -> None: ...


class InboundStore(Protocol):
    def get_or_create(self, message: GroupMessage, raw: dict) -> tuple[int, bool]:
        """Insert unless ``(device_id, message_id)`` exists; return ``(id, created)``."""
        ...


class GroupLinks(Protocol):
    def crew_id_for_chat(self, chat_id: str) -> str | None: ...


class ProcessScheduler(Protocol):
    def schedule(self, inbound_id: int) -> None:
        """Arrange for ``process_inbound(inbound_id)`` to run soon, off the request path."""
        ...


class ProcessStore(Protocol):
    def claim(self, inbound_id: int, now: datetime) -> InboundRecord | None:
        """Move a ``received`` row to ``processing`` (counting an attempt); ``None`` if not due."""
        ...

    def finish(
        self,
        inbound_id: int,
        *,
        status: str,
        outcome: dict,
        error: str,
        person_id: str | None,
        now: datetime,
    ) -> None: ...


class SenderResolver(Protocol):
    def person_id_for(self, jid: str, lid: str) -> str | None: ...


class RosterSync(Protocol):
    def crew_id_for_chat(self, chat_id: str) -> str | None: ...

    def is_active_member(self, crew_id: str, person_id: str) -> bool: ...

    def roster_last_synced_at(self, crew_id: str) -> datetime | None: ...

    def sync_roster(self, crew_id: str) -> object: ...


class Replier(Protocol):
    def can_reply(self, chat_id: str) -> bool:
        """False while the chat is over its reply budget (flood protection)."""
        ...

    def reply(self, *, chat_id: str, body: str, reply_to: str, inbound_id: int) -> str:
        """Send a threaded reply in the group and return its send status."""
        ...


@dataclass(frozen=True)
class QueuedMessage:
    id: int
    to_jid: str
    kind: str
    body: str
    reply_to: str | None


class JobLocks(Protocol):
    def acquire(self, name: str, until: datetime, owner: str, now: datetime) -> bool:
        """Take the lock unless somebody holds it (``locked_until`` in the future)."""
        ...

    def release(self, name: str, owner: str, now: datetime) -> None: ...


class TickInbound(Protocol):
    def sweep_stuck(self, before: datetime, max_attempts: int, now: datetime) -> tuple[int, int]:
        """``processing`` rows claimed before ``before`` go back to ``received``, or ``failed``
        once they used ``max_attempts``. Returns ``(requeued, failed)``."""
        ...

    def received_ids(self, limit: int) -> list[int]: ...


class OutboundQueue(Protocol):
    def queued(
        self, created_before: datetime, max_attempts: int, limit: int
    ) -> list[QueuedMessage]: ...

    def claim(self, message_id: int, now: datetime) -> bool:
        """Atomically move a ``queued`` row to ``sending`` (counting an attempt)."""
        ...

    def mark_sent(self, message_id: int, gowa_message_id: str) -> None: ...

    def mark_failed(self, message_id: int, error: str) -> None: ...

    def sweep_stuck(self, before: datetime, max_attempts: int, now: datetime) -> int:
        """``sending`` rows claimed before ``before`` go back to ``queued`` (or ``failed`` once out
        of attempts). Returns how many were requeued."""
        ...


class RosterSyncSource(Protocol):
    def crews_needing_sync(self, before: datetime) -> list[str]: ...

    def sync_roster(self, crew_id: str) -> object: ...


@dataclass(frozen=True)
class ReminderTrip:
    """An active trip whose crew has a linked WhatsApp group."""

    trip_id: str
    crew_id: str
    chat_id: str
    timezone: str
    start_on: date | None
    end_on: date | None


class ReminderTrips(Protocol):
    def active_trips(self) -> list[ReminderTrip]: ...
