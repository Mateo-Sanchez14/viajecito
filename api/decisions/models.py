import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Decision(models.Model):
    """A group decision on a trip; M2 ships the ``dates`` kind (candidate range plus lengths)."""

    class Kind(models.TextChoices):
        DATES = "dates"

    class Status(models.TextChoices):
        OPEN = "open"
        CLOSED = "closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="decisions")
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.DATES)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.OPEN)
    window_start = models.DateField()
    window_end = models.DateField()
    min_days = models.PositiveSmallIntegerField()
    max_days = models.PositiveSmallIntegerField()
    maybe_weight = models.DecimalField(max_digits=3, decimal_places=2, default="0.50")
    deadline = models.DateTimeField(null=True, blank=True)
    outcome_start = models.DateField(null=True, blank=True)
    outcome_end = models.DateField(null=True, blank=True)
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["trip", "status"], name="decision_trip_status_idx")]
        constraints = [
            models.UniqueConstraint(
                fields=["trip"],
                condition=Q(kind="dates", status="open"),
                name="one_open_dates_decision",
            ),
            models.CheckConstraint(
                condition=Q(window_end__gte=F("window_start")), name="decision_window_ordered"
            ),
            models.CheckConstraint(
                condition=Q(min_days__gte=1, min_days__lte=60), name="decision_min_days_range"
            ),
            models.CheckConstraint(
                condition=Q(max_days__gte=F("min_days"), max_days__lte=60),
                name="decision_max_days_range",
            ),
            models.CheckConstraint(
                condition=Q(maybe_weight__gte=0, maybe_weight__lte=1),
                name="decision_maybe_weight_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.kind} decision of {self.trip_id} ({self.status})"


class AvailabilityResponse(models.Model):
    """One person's answer for one day. Belongs to the trip so it survives a reopened decision."""

    class Answer(models.TextChoices):
        YES = "yes"
        MAYBE = "maybe"
        NO = "no"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(
        "trips.Trip", on_delete=models.CASCADE, related_name="availability_responses"
    )
    person = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="availability_responses"
    )
    date = models.DateField()
    answer = models.CharField(max_length=8, choices=Answer.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["trip", "date"], name="availability_trip_date_idx")]
        constraints = [
            models.UniqueConstraint(
                fields=["trip", "person", "date"], name="unique_availability_per_day"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.person_id} {self.date} {self.answer}"
