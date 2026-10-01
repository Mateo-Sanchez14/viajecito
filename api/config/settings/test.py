from .base import *  # noqa: F403

DEBUG = False
SECRET_KEY = "test-secret-key"

# File-based test database so WAL (which needs a file) is observable in tests.
TEST_DB_DIR = DATA_DIR / "test"  # noqa: F405
TEST_DB_DIR.mkdir(parents=True, exist_ok=True)
DATABASES["default"]["TEST"] = {"NAME": TEST_DB_DIR / "test_db.sqlite3"}  # noqa: F405

STORAGES = {
    **STORAGES,  # noqa: F405
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

OTP_PEPPER = "test-pepper"
OTP_SEND_SYNC = True
