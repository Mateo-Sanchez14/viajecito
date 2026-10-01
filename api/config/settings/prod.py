from .base import *  # noqa: F403

DEBUG = False
# No fallback: production must provide a real secret.
SECRET_KEY = env.str("DJANGO_SECRET_KEY")  # noqa: F405
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# No fallback: a missing pepper would make stored OTP hashes guessable.
OTP_PEPPER = env.str("OTP_PEPPER")  # noqa: F405
