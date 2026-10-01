import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.exceptions import ValidationError
from django.db import models

from shared.phone import InvalidPhoneError, normalize_phone


class PersonManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, phone: str, **extra):
        if not phone:
            raise ValueError("phone is required")
        person = self.model(phone=phone, **extra)
        person.set_unusable_password()
        person.save(using=self._db)
        return person

    def create_superuser(self, phone: str, password: str | None = None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        person = self.model(phone=phone, **extra)
        if password:
            person.set_password(password)
        else:
            person.set_unusable_password()
        person.save(using=self._db)
        return person


class Person(AbstractBaseUser, PermissionsMixin):
    """A human. Identified by an E.164 phone; logs in with a WhatsApp one-time code, no password."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=20, unique=True)
    display_name = models.CharField(max_length=120, blank=True)
    locale = models.CharField(max_length=10, default="es-AR")
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS: list[str] = []

    objects = PersonManager()

    def __str__(self) -> str:
        return self.display_name or self.phone

    def clean(self) -> None:
        super().clean()
        try:
            self.phone = normalize_phone(self.phone)
        except InvalidPhoneError as exc:
            raise ValidationError({"phone": "Enter a valid phone number."}) from exc

    def save(self, *args, **kwargs):
        self.phone = normalize_phone(self.phone)
        super().save(*args, **kwargs)


class WhatsAppIdentity(models.Model):
    """The WhatsApp addresses (phone JID and optional LID) that belong to a person."""

    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="whatsapp_identities")
    jid = models.CharField(max_length=64, unique=True)
    lid = models.CharField(max_length=64, unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.jid


class OtpChallenge(models.Model):
    """One login code request. The code itself is never stored, only its HMAC.

    A row is created for every valid request (``eligible`` records whether the phone could log in)
    so that rate limits and latency do not reveal which phones belong to a crew.
    """

    phone = models.CharField(max_length=20)
    code_hmac = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    consumed_at = models.DateTimeField(null=True, blank=True)
    ip = models.CharField(max_length=45, blank=True)
    eligible = models.BooleanField(default=False)
    created_at = models.DateTimeField()  # set from the injected clock

    class Meta:
        indexes = [
            models.Index(fields=["phone", "created_at"]),
            models.Index(fields=["ip", "created_at"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return f"otp {self.phone} @ {self.created_at:%Y-%m-%d %H:%M:%S}"
