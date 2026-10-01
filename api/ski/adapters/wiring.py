"""Composition of the ski ports for the places that run outside a request (tick job)."""

import time
from datetime import datetime

from ski import conf
from ski.adapters.django_store import DjangoSnowStore
from ski.adapters.open_meteo import OpenMeteoProvider
from ski.use_cases.refresh_snow import refresh_snow


def snow_refresh_job(now: datetime) -> dict[str, int]:
    """``messaging.reminders`` tick job ``ski.snow_refresh``."""
    deadline = time.monotonic() + conf.tick_budget_seconds()
    return refresh_snow(
        now,
        DjangoSnowStore(),
        OpenMeteoProvider(),
        has_time=lambda: time.monotonic() < deadline,
    )
