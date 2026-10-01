import uuid

from django.conf import settings
from django.db import models


class Timestamped(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class TaskSequence(models.Model):
    """Persistent high-water mark, retained even when every task is removed."""

    trip = models.OneToOneField("trips.Trip", on_delete=models.CASCADE, primary_key=True)
    last_number = models.PositiveIntegerField(default=0)


class Task(Timestamped):
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="tasks")
    number = models.PositiveIntegerField()
    kind = models.CharField(max_length=8, default="todo")
    title = models.CharField(max_length=200)
    notes = models.TextField(max_length=2000, default="")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    due_on = models.DateField(null=True)
    status = models.CharField(max_length=8, default="open")
    quantity = models.PositiveSmallIntegerField(null=True)
    proposal = models.ForeignKey(
        "proposals.Proposal", on_delete=models.SET_NULL, null=True, related_name="+"
    )
    source = models.CharField(max_length=12, default="manual")
    nudge_count = models.PositiveSmallIntegerField(default=0)
    last_nudged_at = models.DateTimeField(null=True)
    done_at = models.DateTimeField(null=True)
    done_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["trip", "number"], name="unique_task_number"),
            models.UniqueConstraint(
                fields=["proposal", "kind"],
                condition=models.Q(proposal__isnull=False),
                name="one_task_per_proposal_kind",
            ),
        ]
        indexes = [
            models.Index(fields=["trip", "status"]),
            models.Index(fields=["status", "due_on"]),
        ]
