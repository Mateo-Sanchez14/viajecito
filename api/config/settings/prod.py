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
# No fallback: an empty secret would make the webhook reject everything (it fails closed).
GOWA_WEBHOOK_SECRET = env.str("GOWA_WEBHOOK_SECRET")  # noqa: F405
if not GOWA_WEBHOOK_SECRET:
    raise ImproperlyConfigured("GOWA_WEBHOOK_SECRET must not be empty in production")
