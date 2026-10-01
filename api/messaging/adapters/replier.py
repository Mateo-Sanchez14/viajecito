from datetime import timedelta

from django.utils import timezone

from messaging.adapters.sender import GowaMessageSender
from messaging.models import OutboundMessage

MIN_GAP = timedelta(seconds=3)  # at most one reply per chat every 3 s ...
WINDOW = timedelta(minutes=10)
MAX_PER_WINDOW = 20  # ... and 20 per 10 minutes


class GroupReplier:
    """Replies in the group through the outbound ledger (one reply per inbound message)."""

    def __init__(self, sender: GowaMessageSender | None = None) -> None:
        self._sender = sender or GowaMessageSender()

    def can_reply(self, chat_id: str) -> bool:
        now = timezone.now()
        recent = OutboundMessage.objects.filter(
            kind=OutboundMessage.Kind.REPLY, to_jid=chat_id, created_at__gte=now - WINDOW
        )
        if recent.filter(created_at__gt=now - MIN_GAP).exists():
            return False
        return recent.count() < MAX_PER_WINDOW

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
