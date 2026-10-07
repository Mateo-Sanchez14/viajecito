import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from shared.timezones import InvalidTimezoneError, validate_timezone
from trips import domain


class Trip(models.Model):
    """A trip a crew plans together. Its ``type`` selects the plugin that defines its modules."""

    class Status(models.TextChoices):
        IDEA = "idea"
        PLANNING = "planning"
        BOOKED = "booked"
        ONGOING = "ongoing"
        DONE = "done"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    crew = models.ForeignKey("crews.Crew", on_delete=models.CASCADE, related_name="trips")
    name = models.CharField(max_length=120)
    type = models.CharField(max_length=32, default=domain.DEFAULT_TRIP_TYPE)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PLANNING)
    start_on = models.DateField(null=True, blank=True)
    end_on = models.DateField(null=True, blank=True)
    destination_label = models.CharField(max_length=200, blank=True, default="")
    timezone = models.CharField(max_length=64, blank=True)  # defaults to the crew's on save
    currency = models.CharField(max_length=3, default=domain.DEFAULT_CURRENCY)
    fx_rates = models.JSONField(default=dict, blank=True)
    # Private cover photo (WebP). MEDIA is not publicly routed; it is served by an authorized
    # endpoint. ``cover_version`` changes whenever the cover is set, replaced or removed.
    cover = models.ImageField(upload_to="trips/covers/", null=True, blank=True)
    cover_version = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name

    def clean(self) -> None:
        super().clean()
        try:
            domain.validate_dates(self.start_on, self.end_on)
        except domain.InvalidTripInputError as exc:
            raise ValidationError({"end_on": str(exc)}) from exc
        if self.timezone:
            try:
                validate_timezone(self.timezone)
            except InvalidTimezoneError as exc:
                raise ValidationError({"timezone": "Enter a valid IANA timezone."}) from exc

    def save(self, *args, **kwargs):
        self.currency = domain.normalize_currency(self.currency)
        if not self.timezone:
            self.timezone = self.crew.timezone
        validate_timezone(self.timezone)
        super().save(*args, **kwargs)


class Participation(models.Model):
    class Rsvp(models.TextChoices):
        IN = "in"
        MAYBE = "maybe"
        OUT = "out"
        PENDING = "pending"

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="participations")
    person = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="participations"
    )
    rsvp = models.CharField(max_length=8, choices=Rsvp.choices, default=Rsvp.PENDING)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["trip", "person"], name="unique_trip_person"),
        ]

    def __str__(self) -> str:
        return f"{self.person_id}@{self.trip_id} ({self.rsvp})"
