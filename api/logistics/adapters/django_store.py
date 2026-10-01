from django.db import transaction
from django.db.models import F

from logistics.models import Task, TaskSequence

FIELDS = (
    "id",
    "trip_id",
    "number",
    "kind",
    "title",
    "notes",
    "owner_id",
    "due_on",
    "status",
    "quantity",
    "proposal_id",
    "source",
    "nudge_count",
    "last_nudged_at",
    "done_at",
    "done_by_id",
    "created_by_id",
    "created_at",
    "updated_at",
)


def task_data(row):
    data = {k: getattr(row, k) for k in FIELDS}
    for k in ("id", "trip_id", "owner_id", "proposal_id", "done_by_id", "created_by_id"):
        data[k] = str(data[k]) if data[k] is not None else None
    return data


class DjangoTaskStore:
    def atomic(self):
        return transaction.atomic()

    def get(self, task_id, *, lock=False):
        rows = Task.objects.select_for_update() if lock else Task.objects
        row = rows.filter(pk=task_id).first()
        return task_data(row) if row else None

    def create(self, trip_id, actor_id, fields):
        sequence, _ = TaskSequence.objects.get_or_create(trip_id=trip_id)
        sequence = TaskSequence.objects.select_for_update().get(pk=sequence.pk)
        TaskSequence.objects.filter(pk=sequence.pk).update(last_number=F("last_number") + 1)
        sequence.refresh_from_db()
        row = Task.objects.create(
            trip_id=trip_id, created_by_id=actor_id, number=sequence.last_number, **fields
        )
        return task_data(row)

    def update(self, task_id, fields):
        row = Task.objects.get(pk=task_id)
        for k, v in fields.items():
            setattr(row, k, v)
        row.save()
        return task_data(row)

    def delete(self, task_id):
        Task.objects.filter(pk=task_id).delete()

    def list(self, trip_id, statuses=None, kind=None, owner=None):
        rows = Task.objects.filter(trip_id=trip_id)
        if statuses:
            rows = rows.filter(status__in=statuses)
        if kind:
            rows = rows.filter(kind=kind)
        if owner:
            rows = rows.filter(owner_id=owner)
        return sorted(
            (task_data(r) for r in rows),
            key=lambda d: (
                d["status"] == "done",
                d["due_on"] is None,
                d["due_on"] or __import__("datetime").date.max,
                d["number"],
            ),
        )
