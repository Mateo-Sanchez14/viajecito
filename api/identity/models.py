import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


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


class WhatsAppIdentity(models.Model):
    """The WhatsApp addresses (phone JID and optional LID) that belong to a person."""

    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="whatsapp_identities")
    jid = models.CharField(max_length=64, unique=True)
    lid = models.CharField(max_length=64, unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.jid
