"""Persistence for itinerary days, entries and notes."""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Timestamped(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ItineraryDay(Timestamped):
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="itinerary_days")
    date = models.DateField()
    title = models.CharField(max_length=120, default="")
    notes = models.TextField(max_length=2000, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["trip", "date"], name="unique_itinerary_day")
        ]


class ItineraryEntry(Timestamped):
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE)
    day = models.ForeignKey(ItineraryDay, on_delete=models.SET_NULL, null=True, blank=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    kind = models.CharField(
        max_length=12,
        default="activity",
        choices=[
            (s, s) for s in ("activity", "transport", "lodging", "meal", "meeting", "ski", "other")
        ],
    )
    title = models.CharField(max_length=200)
    location_label = models.CharField(max_length=200, default="")
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_meeting_point = models.BooleanField(default=False)
    proposal = models.ForeignKey(
        "proposals.Proposal", on_delete=models.SET_NULL, null=True, blank=True
    )
    source = models.CharField(
        max_length=10, default="manual", choices=[("manual", "manual"), ("proposal", "proposal")]
    )
    position = models.PositiveIntegerField(default=0)
    notes = models.TextField(max_length=1000, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["proposal"],
                condition=Q(proposal__isnull=False),
                name="one_entry_per_proposal",
            ),
            models.CheckConstraint(
                condition=Q(ends_at__isnull=True)
                | Q(starts_at__isnull=True)
                | Q(ends_at__gte=F("starts_at")),
                name="itinerary_valid_times",
            ),
        ]
        indexes = [
            models.Index(fields=["trip", "day", "position"]),
            models.Index(fields=["trip", "starts_at"]),
        ]


class Note(Timestamped):
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    body = models.TextField(max_length=1000)
    pinned = models.BooleanField(default=False)

    class Meta:
        indexes = [models.Index(fields=["trip", "pinned", "created_at"])]
