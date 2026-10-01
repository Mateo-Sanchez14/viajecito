from datetime import timedelta

from django.utils import timezone

from messaging.adapters.ledger import DjangoOutboundLedger
from messaging.adapters.provider import build_gateway
from messaging.adapters.sender import GowaMessageSender
from messaging.handlers.types import SentCard
from messaging.models import OutboundMessage
from messaging.ports import GatewayError

MIN_GAP = timedelta(seconds=3)  # at most one reply per chat every 3 s ...
WINDOW = timedelta(minutes=10)
MAX_ATTEMPTS = 3  # total sends of one card (the first plus retries)
MAX_PER_WINDOW = 20  # ... and 20 replies plus cards per 10 minutes

BUDGET_KINDS = (OutboundMessage.Kind.REPLY, OutboundMessage.Kind.CARD)


class GroupReplier:
    """Replies and cards in the group through the outbound ledger."""

    def __init__(self, sender: GowaMessageSender | None = None) -> None:
        self._sender = sender or GowaMessageSender()

    def _in_budget(self, chat_id: str, now) -> bool:
        used = OutboundMessage.objects.filter(
            kind__in=BUDGET_KINDS, to_jid=chat_id, created_at__gte=now - WINDOW
        ).count()
        return used < MAX_PER_WINDOW

    def can_reply(self, chat_id: str) -> bool:
        now = timezone.now()
        recent_reply = OutboundMessage.objects.filter(
            kind=OutboundMessage.Kind.REPLY, to_jid=chat_id, created_at__gt=now - MIN_GAP
        )
        return not recent_reply.exists() and self._in_budget(chat_id, now)

    def reply(self, *, chat_id: str, body: str, reply_to: str, inbound_id: int) -> str:
        result = self._sender.send(
            chat_id,
            body,
            "reply",
            dedupe_key=f"reply:inbound:{inbound_id}",
            reply_to=reply_to,
            subject_type="inbound_message",
            subject_id=str(inbound_id),
        )
        return result.status

    def send_card(
        self,
        *,
        chat_id: str,
        body: str,
        reply_to: str,
        subject_type: str,
        subject_id: str,
        dedupe_key: str,
    ) -> SentCard:
        existing = OutboundMessage.objects.filter(dedupe_key=dedupe_key).first()
        if existing is not None:
            if (
                existing.status == OutboundMessage.Status.FAILED
                and existing.attempts < MAX_ATTEMPTS
            ):
                return self._retry(existing, reply_to)
            return SentCard("duplicate", existing.gowa_message_id or None)
        if not self._in_budget(chat_id, timezone.now()):
            return SentCard("failed", None)  # over the per-chat budget: nothing is recorded
        result = self._sender.send(
            chat_id,
            body,
            "card",
            dedupe_key=dedupe_key,
            reply_to=reply_to,
            subject_type=subject_type,
            subject_id=subject_id,
        )
        return SentCard(result.status, result.gowa_message_id)

    def _retry(self, row: OutboundMessage, reply_to: str) -> SentCard:
        """Send a failed card again on its own row (the ledger counts the attempt)."""
        claimed = OutboundMessage.objects.filter(
            pk=row.pk, status=OutboundMessage.Status.FAILED
        ).update(status=OutboundMessage.Status.SENDING, claimed_at=timezone.now())
        if not claimed:  # a concurrent retry got it first
            return SentCard("duplicate", None)
        ledger = DjangoOutboundLedger()
        try:
            message_id = build_gateway().send_text(row.to_jid, row.body, reply_to or None)
        except GatewayError as exc:
            ledger.mark_failed(row.pk, str(exc))
            return SentCard("failed", None)
        ledger.mark_sent(row.pk, message_id)
        return SentCard("sent", message_id)

    def quoted_subject(self, chat_id: str, gowa_message_id: str) -> tuple[str, str] | None:
        row = (
            OutboundMessage.objects.filter(to_jid=chat_id, gowa_message_id=gowa_message_id)
            .exclude(subject_type="")
            .first()
        )
        return (row.subject_type, row.subject_id) if row else None
