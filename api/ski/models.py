import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from shared.timezones import InvalidTimezoneError, validate_timezone


class Timestamped(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Resort(Timestamped):
    class Country(models.TextChoices):
        AR = "AR"
        CL = "CL"

    class Provider(models.TextChoices):
        OPEN_METEO = "open_meteo"
        MANUAL = "manual"

    slug = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=120)
    country = models.CharField(max_length=2, choices=Country.choices)
    region = models.CharField(max_length=80, blank=True, default="")
    lat = models.DecimalField(max_digits=9, decimal_places=6)
    lng = models.DecimalField(max_digits=9, decimal_places=6)
    base_elev_m = models.PositiveSmallIntegerField()
    summit_elev_m = models.PositiveSmallIntegerField()
    timezone = models.CharField(max_length=64)
    provider = models.CharField(max_length=16, choices=Provider.choices, default="open_meteo")
    provider_ref = models.CharField(max_length=120, blank=True, default="")
    website_url = models.URLField(blank=True, default="")
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["country", "name"]
        indexes = [models.Index(fields=["country", "active"], name="ski_resort_country_active")]
        constraints = [
            models.CheckConstraint(
                condition=Q(summit_elev_m__gt=models.F("base_elev_m")),
                name="ski_resort_summit_above_base",
            )
        ]

    def __str__(self) -> str:
        return self.name

    def clean(self) -> None:
        super().clean()
        try:
            validate_timezone(self.timezone)
        except InvalidTimezoneError as exc:
            raise ValidationError({"timezone": "Enter a valid IANA timezone."}) from exc

    def save(self, *args, **kwargs):
        validate_timezone(self.timezone)
        super().save(*args, **kwargs)


class TripResort(Timestamped):
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="ski_resorts")
    resort = models.ForeignKey(Resort, on_delete=models.PROTECT, related_name="trip_links")
    nights = models.PositiveSmallIntegerField(null=True, blank=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "created_at"]
        constraints = [
            models.UniqueConstraint(fields=["trip", "resort"], name="ski_unique_trip_resort")
        ]


class SnowReport(Timestamped):
    """History row; never updated in place (a new reading is a new row)."""

    class Source(models.TextChoices):
        OPEN_METEO = "open_meteo"
        MANUAL = "manual"

    resort = models.ForeignKey(Resort, on_delete=models.CASCADE, related_name="reports")
    source = models.CharField(max_length=16, choices=Source.choices)
    observed_at = models.DateTimeField()
    fetched_at = models.DateTimeField()
    elevation_m = models.PositiveSmallIntegerField(null=True, blank=True)
    base_cm = models.PositiveSmallIntegerField(null=True, blank=True)
    new_24h_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    forecast_72h_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    temp_c = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    lifts_open = models.PositiveSmallIntegerField(null=True, blank=True)
    lifts_total = models.PositiveSmallIntegerField(null=True, blank=True)
    runs_open = models.PositiveSmallIntegerField(null=True, blank=True)
    runs_total = models.PositiveSmallIntegerField(null=True, blank=True)
    status_text = models.CharField(max_length=280, blank=True, default="")
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    raw = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-observed_at"]
        indexes = [
            models.Index(fields=["resort", "-observed_at"], name="ski_report_resort_observed")
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("snow reports are history and are never updated in place")
        super().save(*args, **kwargs)


class SnowFetchState(Timestamped):
    resort = models.OneToOneField(Resort, on_delete=models.CASCADE, related_name="fetch_state")
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    consecutive_failures = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=200, blank=True, default="")


class SkiProfile(Timestamped):
    """Per person, global across trips. Sensitive: see ``ski.api`` for who may read what."""

    class Discipline(models.TextChoices):
        SKI = "ski"
        SNOWBOARD = "snowboard"
        BOTH = "both"

    class Level(models.TextChoices):
        FIRST_TIME = "first_time"
        BEGINNER = "beginner"
        INTERMEDIATE = "intermediate"
        ADVANCED = "advanced"
        EXPERT = "expert"

    person = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ski_profile"
    )
    discipline = models.CharField(max_length=12, choices=Discipline.choices, default="ski")
    level = models.CharField(max_length=12, choices=Level.choices, default="beginner")
    owns_gear = models.BooleanField(default=False)
    boot_size_eu = models.DecimalField(
        max_digits=3,
        decimal_places=1,
        null=True,
        blank=True,
        validators=[MinValueValidator(30), MaxValueValidator(50)],
    )
    height_cm = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(100), MaxValueValidator(230)]
    )
    weight_kg = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(25), MaxValueValidator(200)]
    )
    share_sizes_with_trip = models.BooleanField(default=False)


class LiftPass(Timestamped):
    class Status(models.TextChoices):
        NEEDED = "needed"
        BOUGHT = "bought"
        SEASON_PASS = "season_pass"
        NOT_NEEDED = "not_needed"

    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="lift_passes")
    person = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="lift_passes"
    )
    resort = models.ForeignKey(Resort, null=True, blank=True, on_delete=models.SET_NULL)
    product = models.CharField(max_length=120, blank=True, default="")
    days = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default="needed")
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default="USD")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["trip", "person", "resort"], name="ski_unique_pass_per_resort"
            ),
            models.UniqueConstraint(
                fields=["trip", "person"],
                condition=Q(resort__isnull=True),
                name="ski_unique_resort_less_pass",
            ),
        ]


class GearPlan(Timestamped):
    class Item(models.TextChoices):
        SKIS = "skis"
        BOARD = "board"
        BOOTS = "boots"
        POLES = "poles"
        HELMET = "helmet"
        GOGGLES = "goggles"
        JACKET = "jacket"
        PANTS = "pants"
        OTHER = "other"

    class Mode(models.TextChoices):
        OWN = "own"
        RENT = "rent"
        BORROW = "borrow"

    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="gear_plans")
    person = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="gear_plans"
    )
    item = models.CharField(max_length=12, choices=Item.choices)
    mode = models.CharField(max_length=8, choices=Mode.choices, default="own")
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    note = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["trip", "person", "item"], name="ski_unique_gear_item")
        ]
