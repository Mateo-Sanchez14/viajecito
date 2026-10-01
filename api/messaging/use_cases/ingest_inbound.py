"""Filter and store one Gowa webhook delivery (idempotent), then schedule its processing."""

from dataclasses import dataclass

from messaging.gowa.parser import parse_message_event
from messaging.ports import GroupLinks, InboundStore, ProcessScheduler


@dataclass(frozen=True)
class IngestResult:
    status: str  # "accepted" | "duplicate" | "ignored"
    reason: str | None = None  # why an event was ignored
    inbound_id: int | None = None

    def body(self) -> dict[str, str]:
        if self.status == "ignored":
            return {"status": "ignored", "reason": self.reason or ""}
        return {"status": self.status}


def ingest_inbound(
    payload: dict,
    *,
    store: InboundStore,
    links: GroupLinks,
    scheduler: ProcessScheduler,
) -> IngestResult:
    """Nothing is stored for events we ignore. No network I/O happens here."""
    if payload.get("event") != "message":
        return IngestResult("ignored", "event")
    message = parse_message_event(payload)
    if message is None:
        return IngestResult("ignored", "invalid_message")
    if message.is_from_me:
        return IngestResult("ignored", "own_message")
    if not message.is_group:
        return IngestResult("ignored", "not_group")
    if links.crew_id_for_chat(message.chat_id) is None:
        return IngestResult("ignored", "unlinked_group")
    inbound_id, created = store.get_or_create(message, payload)
    if not created:
        return IngestResult("duplicate", inbound_id=inbound_id)
    scheduler.schedule(inbound_id)
    return IngestResult("accepted", inbound_id=inbound_id)
