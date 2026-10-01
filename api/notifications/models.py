import uuid

from django.conf import settings
from django.db import models


class Stamped(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class PushSubscription(Stamped):
    """One browser's Web Push subscription. ``endpoint`` is unique across people: the same
    browser logging in as someone else re-assigns the row."""

    person = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions"
    )
    endpoint = models.URLField(max_length=1000, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=64)
    user_agent = models.CharField(max_length=300, blank=True, default="")
    last_ok_at = models.DateTimeField(null=True, blank=True)
    last_error_at = models.DateTimeField(null=True, blank=True)
    failure_count = models.PositiveSmallIntegerField(default=0)

    class Meta:
        indexes = [models.Index(fields=["person"], name="notif_sub_person_idx")]

    def __str__(self) -> str:
        return f"{self.person_id} {self.endpoint[:60]}"


class NotificationPreference(Stamped):
    class Channel(models.TextChoices):
        PUSH = "push"

    class Category(models.TextChoices):
        ALL = "all"
        REMINDERS = "reminders"
        DIGEST = "digest"
        COUNTDOWN = "countdown"
        PROPOSALS = "proposals"

    person = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preferences"
    )
    channel = models.CharField(max_length=8, choices=Channel.choices, default=Channel.PUSH)
    category = models.CharField(max_length=16, choices=Category.choices, default=Category.ALL)
    enabled = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["person", "channel", "category"], name="notif_pref_unique"
            )
        ]


class PushDelivery(Stamped):
    """Dedupe ledger: one row per (reminder dedupe key, person)."""

    class Status(models.TextChoices):
        SENT = "sent"
        FAILED = "failed"
        SKIPPED = "skipped"

    dedupe_key = models.CharField(max_length=200)
    person = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_deliveries"
    )
    status = models.CharField(max_length=8, choices=Status.choices)
    subscriptions_ok = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["dedupe_key", "person"], name="notif_delivery_unique")
        ]
        indexes = [models.Index(fields=["created_at"], name="notif_delivery_created_idx")]


class NotificationJobState(Stamped):
    """Last run of a daily tick job (each tick is a fresh process, so the state lives here)."""

    name = models.CharField(max_length=64, unique=True)
    last_run_on = models.DateField()
