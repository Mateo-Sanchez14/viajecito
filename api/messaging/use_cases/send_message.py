"""Send one WhatsApp text and record it in the outbound ledger."""

import logging
from dataclasses import dataclass

from messaging.ports import GatewayError, OutboundLedger, TextGateway

logger = logging.getLogger(__name__)

REDACTED_BODY = "<redacted>"
REDACTED_KINDS = frozenset({"otp"})


@dataclass(frozen=True)
class SendResult:
    status: str  # "sent" | "failed" | "duplicate"
    entry_id: int


def send_message(
    *,
    ledger: OutboundLedger,
    gateway: TextGateway,
    to_jid: str,
    body: str,
    kind: str,
    dedupe_key: str | None = None,
    reply_to: str | None = None,
    subject_type: str = "",
    subject_id: str = "",
) -> SendResult:
    """Deliver ``body`` and record the outcome. Gateway failures are recorded, never raised."""
    entry = ledger.reserve(
        to_jid=to_jid,
        kind=kind,
        body=REDACTED_BODY if kind in REDACTED_KINDS else body,
        dedupe_key=dedupe_key,
        reply_to=reply_to,
        subject_type=subject_type,
        subject_id=subject_id,
    )
    if not entry.created:
        return SendResult("duplicate", entry.id)
    try:
        message_id = gateway.send_text(to_jid, body, reply_to)
    except GatewayError as exc:
        logger.warning("outbound %s message %s failed: %s", kind, entry.id, exc)
        ledger.mark_failed(entry.id, str(exc))
        return SendResult("failed", entry.id)
    ledger.mark_sent(entry.id, message_id)
    return SendResult("sent", entry.id)
