from cryptography.fernet import Fernet, MultiFernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

DEFAULT_MIME = (
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
)


def cipher():
    keys = getattr(settings, "DOCUMENTS_FERNET_KEYS", "")
    if isinstance(keys, str):
        keys = [k.strip() for k in keys.split(",") if k.strip()]
    if not keys:
        raise ImproperlyConfigured("DOCUMENTS_FERNET_KEYS is required for vault storage")
    return MultiFernet([Fernet(k.encode() if isinstance(k, str) else k) for k in keys])


def max_upload():
    return getattr(settings, "DOCUMENTS_MAX_UPLOAD_BYTES", 15 * 1024 * 1024)


def quota():
    return getattr(settings, "DOCUMENTS_TRIP_QUOTA_BYTES", 1024 * 1024 * 1024)


def allowed_mime():
    return getattr(settings, "DOCUMENTS_ALLOWED_MIME", DEFAULT_MIME)
