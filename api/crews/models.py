import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from shared.phone import InvalidPhoneError, normalize_phone


class Crew(models.Model):
    """A friend group that plans trips together."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    timezone = models.CharField(max_length=64, default="America/Argentina/Buenos_Aires")
    gastito_group_url = models.URLField(null=True, blank=True)
    # String reference: trips depends on crews, never the other way round.
    default_trip = models.ForeignKey(
        "trips.Trip", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name


class WhatsAppGroupLink(models.Model):
    crew = models.OneToOneField(Crew, on_delete=models.CASCADE, related_name="whatsapp_group")
    chat_id = models.CharField(max_length=64, unique=True)  # always ends with @g.us
    linked_at = models.DateTimeField(auto_now_add=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)  # last roster sync from Gowa

    def __str__(self) -> str:
        return self.chat_id


class CrewMembership(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin"
        MEMBER = "member"

    class Source(models.TextChoices):
        GROUP_SYNC = "group_sync"
        INVITE = "invite"
        BOOTSTRAP = "bootstrap"

    class Status(models.TextChoices):
        ACTIVE = "active"
        REMOVED = "removed"

    crew = models.ForeignKey(Crew, on_delete=models.CASCADE, related_name="memberships")
    person = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships"
    )
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.MEMBER)
    source = models.CharField(max_length=16, choices=Source.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["crew", "person"], name="unique_crew_person"),
        ]

    def __str__(self) -> str:
        return f"{self.person_id}@{self.crew_id} ({self.role}, {self.status})"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.status == self.Status.REMOVED:
            # Removing a member withdraws invites issued before the removal, so a stale invite can
            # neither make the phone eligible nor reactivate the membership. (Bulk ``update()``
            # calls bypass this; use ``save()``.)
            Invite.objects.filter(
                crew_id=self.crew_id,
                phone=self.person.phone,
                accepted_at__isnull=True,
                cancelled_at__isnull=True,
            ).update(cancelled_at=timezone.now())


class Invite(models.Model):
    """A phone number invited to a crew; accepting it happens on first successful login."""

    crew = models.ForeignKey(Crew, on_delete=models.CASCADE, related_name="invites")
    phone = models.CharField(max_length=20, db_index=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.phone} -> {self.crew_id}"

    def clean(self) -> None:
        super().clean()
        try:
            self.phone = normalize_phone(self.phone)
        except InvalidPhoneError as exc:
            raise ValidationError({"phone": "Enter a valid phone number."}) from exc

    def save(self, *args, **kwargs):
        self.phone = normalize_phone(self.phone)
        super().save(*args, **kwargs)
