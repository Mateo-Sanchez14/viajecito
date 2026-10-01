"""Ports of the messaging app: what the use cases need from the outside world."""

from dataclasses import dataclass
from typing import Protocol


class GatewayError(Exception):
    """The WhatsApp gateway could not deliver the message."""


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
