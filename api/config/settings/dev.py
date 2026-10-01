from .base import *  # noqa: F403

DEBUG = env.bool("DJANGO_DEBUG", True)  # noqa: F405
# Plain whitenoise storage so dev does not require collectstatic.
STORAGES = {
    **STORAGES,  # noqa: F405
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

OTP_PEPPER = OTP_PEPPER or "dev-only-pepper-change-me"  # noqa: F405

# Canned previews keep local/e2e runs independent of the public network.
LINKPREVIEW_FETCHER = env.str("LINKPREVIEW_FETCHER", "static")  # noqa: F405
