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
    subject_type = models.CharField(max_length=64, blank=True)
    subject_id = models.CharField(max_length=64, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.kind}->{self.to_jid} [{self.status}]"
