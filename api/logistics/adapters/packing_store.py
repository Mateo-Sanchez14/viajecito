from django.db import transaction
from django.db.models import Max

from logistics.models import PackingApplication, PackingEntry


def entry_data(row):
    return {
        k: getattr(row, k)
        for k in ("id", "section", "item_key", "label", "quantity", "packed", "position")
    }


class DjangoPackingStore:
    def atomic(self):
        return transaction.atomic()

    def list(self, trip_id, person_id):
        return list(
            PackingEntry.objects.filter(trip_id=trip_id, person_id=person_id).order_by(
                "position", "created_at", "id"
            )
        )

    def ensure_item(self, trip_id, person_id, key, section, label, quantity):
        maximum = PackingEntry.objects.filter(trip_id=trip_id, person_id=person_id).aggregate(
            n=Max("position")
        )["n"]
        PackingEntry.objects.get_or_create(
            trip_id=trip_id,
            person_id=person_id,
            item_key=key,
            defaults={
                "section": section,
                "label": label,
                "quantity": quantity,
                "position": (maximum or 0) + 1,
            },
        )

    def mark_applied(self, trip_id, person_id, key):
        PackingApplication.objects.get_or_create(
            trip_id=trip_id, person_id=person_id, template_key=key
        )
