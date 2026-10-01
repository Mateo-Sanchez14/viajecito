from datetime import datetime

from django.db import transaction
from django.db.models import F

from notifications.domain.subscriptions import ValidSubscription
from notifications.models import NotificationPreference, PushDelivery, PushSubscription
from notifications.ports import DeliveryStatus, SubscriptionData


def subscription_data(row: PushSubscription) -> SubscriptionData:
    return SubscriptionData(
        id=str(row.pk),
        person_id=str(row.person_id),
        endpoint=row.endpoint,
        p256dh=row.p256dh,
        auth=row.auth,
        failure_count=row.failure_count,
        created_at=row.created_at,
    )


class DjangoSubscriptionStore:
    def list_for_person(self, person_id: str) -> list[SubscriptionData]:
        rows = PushSubscription.objects.filter(person_id=person_id).order_by("created_at")
        return [subscription_data(row) for row in rows]

    def get_by_endpoint(self, endpoint: str) -> SubscriptionData | None:
        row = PushSubscription.objects.filter(endpoint=endpoint).first()
        return subscription_data(row) if row else None

    def upsert(
        self, person_id: str, subscription: ValidSubscription
    ) -> tuple[SubscriptionData, bool]:
        with transaction.atomic():
            row, created = PushSubscription.objects.update_or_create(
                endpoint=subscription.endpoint,
                defaults={
                    "person_id": person_id,
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth,
                    "user_agent": subscription.user_agent,
                    "failure_count": 0,
                },
            )
        return subscription_data(row), created

    def trim(self, person_id: str, keep: int, protect_id: str) -> None:
        ids = [
            str(pk)
            for pk in PushSubscription.objects.filter(person_id=person_id)
            .order_by("created_at")
            .values_list("pk", flat=True)
        ]
        excess = len(ids) - keep
        if excess > 0:
            doomed = [pk for pk in ids if pk != protect_id][:excess]
            PushSubscription.objects.filter(pk__in=doomed).delete()

    def delete_endpoint(self, person_id: str, endpoint: str) -> None:
        PushSubscription.objects.filter(person_id=person_id, endpoint=endpoint).delete()

    def delete(self, subscription_id: str) -> None:
        PushSubscription.objects.filter(pk=subscription_id).delete()

    def mark_ok(self, subscription_id: str, now: datetime) -> None:
        PushSubscription.objects.filter(pk=subscription_id).update(last_ok_at=now, failure_count=0)

    def mark_failed(self, subscription_id: str, now: datetime) -> int:
        PushSubscription.objects.filter(pk=subscription_id).update(
            last_error_at=now, failure_count=F("failure_count") + 1
        )
        row = PushSubscription.objects.filter(pk=subscription_id).first()
        return row.failure_count if row else 0


class DjangoPreferenceStore:
    def stored(self, person_id: str) -> dict[str, bool]:
        return self.stored_for_people([person_id]).get(person_id, {})

    def stored_for_people(self, person_ids: list[str]) -> dict[str, dict[str, bool]]:
        rows = NotificationPreference.objects.filter(
            person_id__in=person_ids, channel=NotificationPreference.Channel.PUSH
        )
        result: dict[str, dict[str, bool]] = {}
        for row in rows:
            result.setdefault(str(row.person_id), {})[row.category] = row.enabled
        return result

    def save(self, person_id: str, changes: dict[str, bool]) -> None:
        with transaction.atomic():
            for category, enabled in changes.items():
                NotificationPreference.objects.update_or_create(
                    person_id=person_id,
                    channel=NotificationPreference.Channel.PUSH,
                    category=category,
                    defaults={"enabled": enabled},
                )


class DjangoDeliveryLedger:
    def reserve(self, dedupe_key: str, person_id: str) -> bool:
        _, created = PushDelivery.objects.get_or_create(
            dedupe_key=dedupe_key,
            person_id=person_id,
            defaults={"status": PushDelivery.Status.FAILED, "subscriptions_ok": 0},
        )
        return created

    def finish(
        self, dedupe_key: str, person_id: str, status: DeliveryStatus, subscriptions_ok: int
    ) -> None:
        PushDelivery.objects.filter(dedupe_key=dedupe_key, person_id=person_id).update(
            status=status, subscriptions_ok=subscriptions_ok
        )

    def delete_older_than(self, cutoff: datetime, limit: int) -> int:
        ids = list(
            PushDelivery.objects.filter(created_at__lt=cutoff)
            .order_by("created_at")
            .values_list("pk", flat=True)[:limit]
        )
        if not ids:
            return 0
        deleted, _ = PushDelivery.objects.filter(pk__in=ids).delete()
        return deleted
