"""Health probes. Each returns ``"ok"`` or ``"error"`` and never raises."""

import logging
import uuid
from pathlib import Path
from typing import Literal

from django.conf import settings
from django.db import connection

logger = logging.getLogger(__name__)

CheckResult = Literal["ok", "error"]


def check_db() -> CheckResult:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        logger.exception("health: database check failed")
        return "error"
    return "ok"


def check_media() -> CheckResult:
    try:
        root = Path(settings.MEDIA_ROOT)
        root.mkdir(parents=True, exist_ok=True)
        probe = root / f".health-{uuid.uuid4().hex}"
        probe.write_bytes(b"ok")
        probe.unlink()
    except Exception:
        logger.exception("health: media check failed")
        return "error"
    return "ok"
