"""Shared types of the inbound handler chain."""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from messaging.domain import InboundRecord


@dataclass(frozen=True)
class SentCard:
    """Outcome of ``HandlerContext.send_card``."""

    status: str  # "sent" | "failed" | "duplicate" ("failed" also when the chat is over budget)
    gowa_message_id: str | None  # None unless sent (or the existing row's id on duplicate)


def _no_card_sender(body: str, *, subject_type: str, subject_id: str, dedupe_key: str) -> SentCard:
    raise RuntimeError("this context cannot send cards")


@dataclass(frozen=True)
class HandlerContext:
    message: InboundRecord
    person_id: str
    crew_id: str
    reply: Callable[[str], str]  # sends a threaded reply in the group; returns its send status
    reply_allowed: Callable[[], bool] = lambda: True  # False while the chat is being throttled
    # ``send_card(body, *, subject_type, subject_id, dedupe_key)``: a threaded ``kind="card"``
    # message that keeps its subject on the ledger row. Exempt from the 3 s reply gap, but counted
    # in the per-chat 20-per-10-minutes budget.
    send_card: Callable[..., SentCard] = _no_card_sender
    # (subject_type, subject_id) of OUR message the inbound one quotes; ``None`` otherwise.
    quoted_subject: tuple[str, str] | None = None


@dataclass(frozen=True)
class Handled:
    """A handler claimed the message. ``detail`` is stored in the row's ``outcome``."""

    handler: str
    detail: dict[str, Any] = field(default_factory=dict)


Handler = Callable[[HandlerContext], Handled | None]
