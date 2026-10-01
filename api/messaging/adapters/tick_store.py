from datetime import datetime

from django.db import transaction
from django.db.models import F

from messaging.models import InboundMessage, JobLock, OutboundMessage
from messaging.ports import QueuedMessage


class DjangoJobLocks:
    def acquire(self, name: str, until: datetime, owner: str, now: datetime) -> bool:
        with transaction.atomic():
            JobLock.objects.get_or_create(name=name, defaults={"locked_until": now})
        taken = JobLock.objects.filter(name=name, locked_until__lte=now).update(
            locked_until=until, locked_by=owner
        )
        return taken == 1

    def release(self, name: str, owner: str, now: datetime) -> None:
        JobLock.objects.filter(name=name, locked_by=owner).update(locked_until=now)


class DjangoTickInbound:
    def sweep_stuck(self, before: datetime, max_attempts: int) -> tuple[int, int]:
        stuck = InboundMessage.objects.filter(
            status=InboundMessage.Status.PROCESSING, claimed_at__lt=before
        )
        failed = stuck.filter(attempts__gte=max_attempts).update(
            status=InboundMessage.Status.FAILED,
            error="stuck in processing and out of attempts",
        )
        requeued = stuck.filter(attempts__lt=max_attempts).update(
            status=InboundMessage.Status.RECEIVED
        )
        return requeued, failed

    def received_ids(self, limit: int) -> list[int]:
        rows = InboundMessage.objects.filter(status=InboundMessage.Status.RECEIVED)
        return list(rows.order_by("pk").values_list("pk", flat=True)[:limit])


class DjangoOutboundQueue:
    def queued(
        self, created_before: datetime, max_attempts: int, limit: int
    ) -> list[QueuedMessage]:
        rows = OutboundMessage.objects.filter(
            status=OutboundMessage.Status.QUEUED,
            attempts__lt=max_attempts,
            created_at__lt=created_before,
        ).order_by("pk")[:limit]
        return [
            QueuedMessage(
                id=row.pk,
                to_jid=row.to_jid,
                kind=row.kind,
                body=row.body,
                reply_to=row.reply_to_message_id or None,
            )
            for row in rows
        ]


__all__ = ["DjangoJobLocks", "DjangoOutboundQueue", "DjangoTickInbound", "F"]
