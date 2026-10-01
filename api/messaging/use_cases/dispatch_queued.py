"""Send outbound messages that were reserved in the ledger but never delivered."""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from messaging.ports import GatewayError, OutboundQueue, TextGateway
from messaging.use_cases.send_message import REDACTED_KINDS
from shared.clock import Clock

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DispatchResult:
    sent: int = 0
    failed: int = 0


def dispatch_queued(
    *,
    queue: OutboundQueue,
    gateway: TextGateway,
    clock: Clock,
    min_age: timedelta,
    max_attempts: int,
    limit: int,
    deadline: datetime,
) -> DispatchResult:
    """Deliver queued rows, claiming each one first so an overlapping tick cannot resend it.

    Rows younger than ``min_age`` may still be in flight in the process that reserved them.
    Stops once ``deadline`` has passed (the tick lock is about to expire).
    """
    sent = failed = 0
    for message in queue.queued(clock.now() - min_age, max_attempts, limit):
        if clock.now() >= deadline:
            break
        if not queue.claim(message.id, clock.now()):
            continue  # another tick got it first
        if message.kind in REDACTED_KINDS:  # the stored body is a placeholder: never resend it
            queue.mark_failed(message.id, "body was redacted; cannot be redelivered")
            continue
        try:
            gateway_id = gateway.send_text(message.to_jid, message.body, message.reply_to)
        except GatewayError as exc:
            logger.warning("queued outbound %s failed: %s", message.id, exc)
            queue.mark_failed(message.id, str(exc))
            failed += 1
            continue
        queue.mark_sent(message.id, gateway_id)
        sent += 1
    return DispatchResult(sent, failed)
