from django.conf import settings
from django.db import models


class OutboundMessage(models.Model):
    """Ledger of every message sent to WhatsApp. OTP bodies are redacted before they are stored."""

    class Kind(models.TextChoices):
        OTP = "otp"
        CARD = "card"
        REMINDER = "reminder"
        REPLY = "reply"

    class Status(models.TextChoices):
        QUEUED = "queued"
        SENDING = "sending"  # claimed by a tick that is delivering it right now
        SENT = "sent"
        FAILED = "failed"

    to_jid = models.CharField(max_length=64)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    body = models.TextField()
    dedupe_key = models.CharField(max_length=200, unique=True, null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.QUEUED)
    attempts = models.PositiveIntegerField(default=0)
    gowa_message_id = models.CharField(max_length=128, blank=True)
    reply_to_message_id = models.CharField(max_length=128, blank=True)
    mentions = models.JSONField(default=list, blank=True)  # JIDs, sent only with mentions enabled
    subject_type = models.CharField(max_length=64, blank=True)
    subject_id = models.CharField(max_length=64, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    claimed_at = models.DateTimeField(null=True, blank=True)  # when a tick started sending
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.kind}->{self.to_jid} [{self.status}]"


class InboundMessage(models.Model):
    """Ledger of every group message Gowa delivered to the webhook (idempotent per device+id)."""

    class Status(models.TextChoices):
        RECEIVED = "received"
        PROCESSING = "processing"
        DONE = "done"
        IGNORED = "ignored"
        FAILED = "failed"

    device_id = models.CharField(max_length=128, blank=True)
    gowa_message_id = models.CharField(max_length=128)
    event = models.CharField(max_length=32)
    chat_id = models.CharField(max_length=64)
    sender_jid = models.CharField(max_length=64, blank=True)
    sender_lid = models.CharField(max_length=64, blank=True)
    sender_name = models.CharField(max_length=120, blank=True)
    person = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    body = models.TextField(blank=True)
    replied_to_id = models.CharField(max_length=128, blank=True)
    raw = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RECEIVED)
    attempts = models.PositiveIntegerField(default=0)
    error = models.TextField(blank=True)
    outcome = models.JSONField(default=dict, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)  # WhatsApp timestamp of the message
    received_at = models.DateTimeField(auto_now_add=True)
    claimed_at = models.DateTimeField(null=True, blank=True)  # when processing last started
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["device_id", "gowa_message_id"], name="unique_inbound_device_message"
            ),
        ]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["chat_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.chat_id}/{self.gowa_message_id} [{self.status}]"


class JobLock(models.Model):
    """Advisory lock so overlapping scheduled runs (e.g. ``tick``) never work concurrently."""

    name = models.CharField(max_length=64, unique=True)
    locked_until = models.DateTimeField()
    locked_by = models.CharField(max_length=64, blank=True)

    def __str__(self) -> str:
        return f"{self.name} until {self.locked_until:%H:%M:%S}"
