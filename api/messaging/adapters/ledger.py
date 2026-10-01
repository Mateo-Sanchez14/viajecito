from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from messaging.models import OutboundMessage
from messaging.ports import LedgerEntry


class DjangoOutboundLedger:
    def reserve(
        self,
        *,
        to_jid: str,
        kind: str,
        body: str,
        dedupe_key: str | None,
        reply_to: str | None,
        subject_type: str,
        subject_id: str,
    ) -> LedgerEntry:
        try:
            with transaction.atomic():
                row = OutboundMessage.objects.create(
                    to_jid=to_jid,
                    kind=kind,
                    body=body,
                    dedupe_key=dedupe_key,
                    reply_to_message_id=reply_to or "",
                    subject_type=subject_type,
                    subject_id=subject_id,
                )
        except IntegrityError:
            existing = OutboundMessage.objects.get(dedupe_key=dedupe_key)
            return LedgerEntry(
                existing.pk, created=False, gowa_message_id=existing.gowa_message_id or None
            )
        return LedgerEntry(row.pk, created=True)

    def mark_sent(self, entry_id: int, gowa_message_id: str) -> None:
        OutboundMessage.objects.filter(pk=entry_id).update(
            status=OutboundMessage.Status.SENT,
            gowa_message_id=gowa_message_id,
            sent_at=timezone.now(),
            attempts=F("attempts") + 1,
        )

    def mark_failed(self, entry_id: int, error: str) -> None:
        OutboundMessage.objects.filter(pk=entry_id).update(
            status=OutboundMessage.Status.FAILED, error=error, attempts=F("attempts") + 1
        )
