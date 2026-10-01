from datetime import datetime

from django.db import transaction
from django.db.models import F

from messaging.domain import GroupMessage, InboundRecord
from messaging.models import InboundMessage


class DjangoInboundStore:
    def get_or_create(self, message: GroupMessage, raw: dict) -> tuple[int, bool]:
        with transaction.atomic():
            row, created = InboundMessage.objects.get_or_create(
                device_id=message.device_id,
                gowa_message_id=message.message_id,
                defaults={
                    "event": "message",
                    "chat_id": message.chat_id,
                    "sender_jid": message.sender_jid,
                    "sender_lid": message.sender_lid,
                    "sender_name": message.sender_name,
                    "body": message.body,
                    "replied_to_id": message.replied_to_id,
                    "raw": raw,
                    "sent_at": message.timestamp,
                },
            )
        return row.pk, created

    def claim(self, inbound_id: int, now: datetime) -> InboundRecord | None:
        claimed = InboundMessage.objects.filter(
            pk=inbound_id, status=InboundMessage.Status.RECEIVED
        ).update(
            status=InboundMessage.Status.PROCESSING,
            attempts=F("attempts") + 1,
            claimed_at=now,
        )
        if claimed != 1:  # somebody else (the executor or a tick) owns it, or it is finished
            return None
        row = InboundMessage.objects.get(pk=inbound_id)
        return InboundRecord(
            id=row.pk,
            chat_id=row.chat_id,
            gowa_message_id=row.gowa_message_id,
            body=row.body,
            sender_jid=row.sender_jid,
            sender_lid=row.sender_lid,
            sender_name=row.sender_name,
            replied_to_id=row.replied_to_id,
            attempts=row.attempts,
        )

    def finish(
        self,
        inbound_id: int,
        *,
        status: str,
        outcome: dict,
        error: str,
        person_id: str | None,
        now: datetime,
    ) -> None:
        InboundMessage.objects.filter(pk=inbound_id).update(
            status=status,
            outcome=outcome,
            error=error,
            person_id=person_id,
            processed_at=None if status == InboundMessage.Status.RECEIVED else now,
        )
