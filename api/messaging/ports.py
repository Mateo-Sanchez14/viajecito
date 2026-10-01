"""Ports of the messaging app: what the use cases need from the outside world."""

from dataclasses import dataclass
from typing import Protocol

from messaging.domain import GroupMessage


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
