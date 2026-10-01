"""Base settings shared by every environment. Configuration comes from the environment."""

from pathlib import Path
from urllib.parse import urlparse

from environs import Env

from config.settings.apps import PROJECT_APPS

env = Env()

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # api/
env.read_env(BASE_DIR / ".env", recurse=False)  # only api/.env; real env vars win
REPO_DIR = BASE_DIR.parent  # repo root; runtime data lives in <repo>/data
DATA_DIR = REPO_DIR / "data"

SECRET_KEY = env.str("DJANGO_SECRET_KEY", "insecure-dev-key-change-me")
DEBUG = env.bool("DJANGO_DEBUG", False)

PUBLIC_ORIGIN = env.str("PUBLIC_ORIGIN", "http://localhost:3000")
_origin = urlparse(PUBLIC_ORIGIN)
ALLOWED_HOSTS = sorted({"localhost", "127.0.0.1", "[::1]", "api", _origin.hostname or "localhost"})
CSRF_TRUSTED_ORIGINS = [PUBLIC_ORIGIN]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "ninja",
    *PROJECT_APPS,
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

AUTH_USER_MODEL = "identity.Person"

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASE_PATH = Path(env.str("DATABASE_PATH", str(DATA_DIR / "db.sqlite3")))
MEDIA_ROOT = Path(env.str("MEDIA_ROOT", str(DATA_DIR / "media")))
STATIC_ROOT = Path(env.str("STATIC_ROOT", str(DATA_DIR / "static")))

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": DATABASE_PATH,
        "OPTIONS": {
            "transaction_mode": "IMMEDIATE",
            "timeout": 5,
            "init_command": (
                "PRAGMA journal_mode=WAL;"
                "PRAGMA synchronous=NORMAL;"
                "PRAGMA busy_timeout=5000;"
                "PRAGMA foreign_keys=ON;"
            ),
        },
    }
}

# Runtime data directories must exist before the first request or migration.
for _directory in (DATABASE_PATH.parent, MEDIA_ROOT, STATIC_ROOT):
    _directory.mkdir(parents=True, exist_ok=True)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "es-ar"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
MEDIA_URL = "/media/"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30
SESSION_SAVE_EVERY_REQUEST = True
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

# Gowa (WhatsApp gateway). Read here, consumed by the messaging app in a later milestone.
GOWA_BASE_URL = env.str("GOWA_BASE_URL", "http://localhost:4000")
GOWA_BASIC_AUTH_USER = env.str("GOWA_BASIC_AUTH_USER", "")
GOWA_BASIC_AUTH_PASS = env.str("GOWA_BASIC_AUTH_PASS", "")
GOWA_WEBHOOK_SECRET = env.str("GOWA_WEBHOOK_SECRET", "")  # empty fails closed; required in prod
GOWA_DEVICE_ID = env.str("GOWA_DEVICE_ID", "")  # optional, sent as X-Device-Id
# Pass @-mention JIDs to Gowa and render reminder mentions as @<digits>. Off until Gowa's mention
# field is confirmed; then mentions render as display names.
GOWA_MENTIONS_ENABLED = env.bool("GOWA_MENTIONS_ENABLED", False)

# Inbound processing. False: process on a worker thread after the webhook commits; True: inline.
MESSAGING_PROCESS_SYNC = env.bool("MESSAGING_PROCESS_SYNC", False)
INBOUND_STUCK_MINUTES = env.int("INBOUND_STUCK_MINUTES", 2)
ROSTER_SYNC_HOURS = env.int("ROSTER_SYNC_HOURS", 24)
# Minimum gap between on-demand roster syncs triggered by unknown senders.
ROSTER_SYNC_MIN_INTERVAL_SECONDS = env.int("ROSTER_SYNC_MIN_INTERVAL_SECONDS", 300)

# OTP login. The pepper keys the HMAC of every stored code; prod requires it, other settings
# modules fall back to a development value so `manage.py check` works without a .env file.
OTP_DELIVERY_ENABLED = env.bool("OTP_DELIVERY_ENABLED", True)
OTP_PEPPER = env.str("OTP_PEPPER", "")
OTP_CODE_TTL_SECONDS = env.int("OTP_CODE_TTL_SECONDS", 300)
OTP_MAX_ATTEMPTS = env.int("OTP_MAX_ATTEMPTS", 5)
# False: the Gowa send runs on a worker thread after the transaction commits (latency never leaks
# whether a phone is eligible). True: send inline (tests).
OTP_SEND_SYNC = env.bool("OTP_SEND_SYNC", False)

# Trust the CF-Connecting-IP header for rate limiting only when every request comes through
# cloudflared (prod). Elsewhere the port may be reachable directly, so the header is forgeable.
TRUST_CF_CONNECTING_IP = env.bool("TRUST_CF_CONNECTING_IP", False)
