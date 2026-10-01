"""Build ``HandlerContext``s to drive the bot handlers directly (no webhook)."""

from messaging.domain import InboundRecord
from messaging.handlers.types import HandlerContext, SentCard

CHAT = "120363000000000000@g.us"


class Recorder:
    def __init__(self, *, allowed: bool = True, card_status: str = "sent") -> None:
        self.replies: list[str] = []
        self.cards: list[dict] = []
        self.allowed = allowed
        self.card_status = card_status

    def reply(self, body: str) -> str:
        self.replies.append(body)
        return "sent"

    def send_card(self, body: str, *, subject_type: str, subject_id: str, dedupe_key: str):
        self.cards.append(
            {
                "body": body,
                "subject_type": subject_type,
                "subject_id": subject_id,
                "dedupe_key": dedupe_key,
            }
        )
        return SentCard(self.card_status, "WA-CARD" if self.card_status == "sent" else None)


def make_ctx(
    body: str,
    person,
    crew,
    recorder: Recorder,
    *,
    message_id: int | None = None,
    quoted: tuple[str, str] | None = None,
) -> HandlerContext:
    from messaging.models import InboundMessage

    row = InboundMessage.objects.create(
        device_id="d",
        gowa_message_id=f"M{InboundMessage.objects.count() + 1}",
        event="message",
        chat_id=CHAT,
        body=body,
    )
    record = InboundRecord(
        id=message_id or row.pk,
        chat_id=CHAT,
        gowa_message_id=row.gowa_message_id,
        body=body,
        sender_jid="",
        sender_lid="",
        sender_name=person.display_name,
        replied_to_id="",
        attempts=1,
    )
    return HandlerContext(
        message=record,
        person_id=str(person.pk),
        crew_id=str(crew.pk),
        reply=recorder.reply,
        reply_allowed=lambda: recorder.allowed,
        send_card=recorder.send_card,
        quoted_subject=quoted,
    )
