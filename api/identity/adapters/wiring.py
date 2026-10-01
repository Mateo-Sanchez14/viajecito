"""Composition root for the identity use cases. Tests monkeypatch these factories."""

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from identity.adapters.crews_gateway import CrewsGateway
from identity.adapters.django_repos import DjangoOtpChallengeRepository, DjangoPersonProvisioner
from identity.adapters.otp_sender import DeferredOtpSender, WhatsAppOtpSender
from identity.domain import OtpConfig
from shared.clock import Clock, SystemClock


def clock() -> Clock:
    return SystemClock()


def otp_config() -> OtpConfig:
    if not settings.OTP_PEPPER:
        raise ImproperlyConfigured("OTP_PEPPER must be set")
    return OtpConfig(
        pepper=settings.OTP_PEPPER,
        ttl_seconds=settings.OTP_CODE_TTL_SECONDS,
        max_attempts=settings.OTP_MAX_ATTEMPTS,
    )


def challenge_repo() -> DjangoOtpChallengeRepository:
    return DjangoOtpChallengeRepository()


def person_provisioner() -> DjangoPersonProvisioner:
    return DjangoPersonProvisioner()


def crews_gateway() -> CrewsGateway:
    return CrewsGateway()


def otp_sender() -> DeferredOtpSender:
    return DeferredOtpSender(WhatsAppOtpSender(), synchronous=settings.OTP_SEND_SYNC)
