from django.db import transaction

from messaging.domain import GroupMessage
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
                },
            )
        return row.pk, created
