"""Send outbound messages that were reserved in the ledger but never delivered."""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from messaging.ports import GatewayError, OutboundLedger, OutboundQueue, TextGateway
from messaging.use_cases.send_message import REDACTED_KINDS

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DispatchResult:
    sent: int = 0
    failed: int = 0


def dispatch_queued(
    *,
    queue: OutboundQueue,
    ledger: OutboundLedger,
    gateway: TextGateway,
    now: datetime,
    min_age: timedelta,
    max_attempts: int,
    limit: int,
) -> DispatchResult:
    """Rows younger than ``min_age`` may still be in flight in the process that reserved them."""
    sent = failed = 0
    for message in queue.queued(now - min_age, max_attempts, limit):
        if message.kind in REDACTED_KINDS:  # the stored body is a placeholder: never resend it
            ledger.mark_failed(message.id, "body was redacted; cannot be redelivered")
            continue
        try:
            gateway_id = gateway.send_text(message.to_jid, message.body, message.reply_to)
        except GatewayError as exc:
            logger.warning("queued outbound %s failed: %s", message.id, exc)
            ledger.mark_failed(message.id, str(exc))
            failed += 1
            continue
        ledger.mark_sent(message.id, gateway_id)
        sent += 1
    return DispatchResult(sent, failed)
