from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403

DEBUG = False
# No fallback: production must provide a real secret.
SECRET_KEY = env.str("DJANGO_SECRET_KEY")  # noqa: F405
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# No fallback: a missing pepper would make stored OTP hashes guessable.
OTP_PEPPER = env.str("OTP_PEPPER")  # noqa: F405
if not OTP_PEPPER:
    raise ImproperlyConfigured("OTP_PEPPER must not be empty in production")
# prod is only reachable through cloudflared, which always sets CF-Connecting-IP.
TRUST_CF_CONNECTING_IP = env.bool("TRUST_CF_CONNECTING_IP", True)  # noqa: F405
# No fallback: an empty secret/key would make the active provider's webhook reject everything
# (it fails closed) or its client unauthenticated.
WHATSAPP_PROVIDER = env.str("WHATSAPP_PROVIDER", "gowa")  # noqa: F405
if WHATSAPP_PROVIDER == "waha":
    WAHA_WEBHOOK_HMAC_KEY = env.str("WAHA_WEBHOOK_HMAC_KEY", "")  # noqa: F405
    WAHA_API_KEY = env.str("WAHA_API_KEY", "")  # noqa: F405
    for _name in ("WAHA_WEBHOOK_HMAC_KEY", "WAHA_API_KEY"):
        if not globals()[_name]:
            raise ImproperlyConfigured(f"{_name} must not be empty in production with waha")
else:
    GOWA_WEBHOOK_SECRET = env.str("GOWA_WEBHOOK_SECRET")  # noqa: F405
    if not GOWA_WEBHOOK_SECRET:
        raise ImproperlyConfigured("GOWA_WEBHOOK_SECRET must not be empty in production")
