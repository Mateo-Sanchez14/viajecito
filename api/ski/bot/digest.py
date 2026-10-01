"""Digest section ``ski.snow`` (consumed by the morning digest)."""

from datetime import date

from shared.clock import SystemClock
from ski.adapters.django_store import DjangoSkiStore
from ski.bot.formatting import conditions_block
from ski.use_cases.access import ski_enabled
from ski.use_cases.conditions import trip_conditions

ORDER = 20


def snow_section(trip_id: str, local_date: date) -> str | None:
    """One line per trip resort from the latest report; ``None`` for non-ski trips or when there
    is no report at all."""
    store = DjangoSkiStore()
    trip = store.trip_info(trip_id)
    if trip is None or not ski_enabled(trip.type):
        return None
    conditions = trip_conditions(trip.id, SystemClock().now(), store)
    if not any(c.latest for c in conditions):
        return None
    return conditions_block(conditions)
