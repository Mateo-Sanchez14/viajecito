import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Proposal(models.Model):
    """Something the crew may do on a trip: usually a link someone dropped in the group."""

    class Category(models.TextChoices):
        LODGING = "lodging"
        TRANSPORT = "transport"
        ACTIVITY = "activity"
        FOOD = "food"
        GEAR = "gear"
        DESTINATION = "destination"
        OTHER = "other"

    class Status(models.TextChoices):
        PROPOSED = "proposed"
        DISCUSSING = "discussing"
        CHOSEN = "chosen"
        BOOKED = "booked"
        DISCARDED = "discarded"

    class PriceBasis(models.TextChoices):
        TOTAL = "total"
        PER_PERSON = "per_person"
        PER_NIGHT = "per_night"

    class ClassifiedBy(models.TextChoices):
        RULES = "rules"
        LLM = "llm"
        USER = "user"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey("trips.Trip", on_delete=models.CASCADE, related_name="proposals")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    category = models.CharField(max_length=16, choices=Category.choices, default=Category.OTHER)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PROPOSED)
    title = models.CharField(max_length=300)
    note = models.TextField(max_length=2000, blank=True, default="")
    link_preview = models.ForeignKey(
        "linkpreview.LinkPreview",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="proposals",
    )
    canonical_url = models.CharField(max_length=2000, null=True, blank=True)  # per-trip dedupe
    est_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    price_basis = models.CharField(
        max_length=16, choices=PriceBasis.choices, default=PriceBasis.TOTAL
    )
    currency = models.CharField(max_length=3, default="USD")
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    booking_ref = models.CharField(max_length=120, blank=True, default="")
    chosen_at = models.DateTimeField(null=True, blank=True)
    booked_at = models.DateTimeField(null=True, blank=True)
    discarded_at = models.DateTimeField(null=True, blank=True)
    # String reference: proposals never imports messaging models.
    source_message = models.ForeignKey(
        "messaging.InboundMessage",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    classified_by = models.CharField(
        max_length=16, choices=ClassifiedBy.choices, default=ClassifiedBy.USER
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["trip", "canonical_url"],
                condition=Q(canonical_url__isnull=False),
                name="unique_trip_canonical_url",
            ),
            models.CheckConstraint(
                condition=Q(starts_on__isnull=True)
                | Q(ends_on__isnull=True)
                | Q(ends_on__gte=F("starts_on")),
                name="proposal_ends_after_starts",
            ),
            models.CheckConstraint(
                condition=Q(est_price__isnull=True) | Q(est_price__gte=0),
                name="proposal_price_not_negative",
            ),
        ]
        indexes = [
            models.Index(fields=["trip", "status"]),
            models.Index(fields=["trip", "category"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} [{self.status}]"


class Vote(models.Model):
    proposal = models.ForeignKey(Proposal, on_delete=models.CASCADE, related_name="votes")
    person = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    value = models.SmallIntegerField()  # -1, 0 or 1
    source_message = models.ForeignKey(
        "messaging.InboundMessage",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["proposal", "person"], name="unique_vote_per_person"),
            models.CheckConstraint(condition=Q(value__in=[-1, 0, 1]), name="vote_value_valid"),
        ]

    def __str__(self) -> str:
        return f"{self.person_id}: {self.value:+d} on {self.proposal_id}"


class Comment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    proposal = models.ForeignKey(Proposal, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    body = models.TextField(max_length=2000)
    source_message = models.ForeignKey(
        "messaging.InboundMessage",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["proposal", "created_at"])]

    def __str__(self) -> str:
        return f"{self.author_id} on {self.proposal_id}"
