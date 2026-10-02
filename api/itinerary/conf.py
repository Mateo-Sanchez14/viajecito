"""Existing core origin setting, read lazily (no new milestone env)."""

from django.conf import settings


def public_origin():
    return str(getattr(settings, "PUBLIC_ORIGIN", "http://localhost:3000")).rstrip("/")
