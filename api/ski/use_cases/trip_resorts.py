"""Resorts a trip picks."""

from datetime import datetime

from ski.domain import Conditions, InvalidSkiInputError, ResortNotFoundError
from ski.ports import SkiStore
from ski.use_cases import conditions


class ResortNotOnTripError(LookupError):
    pass


def _conditions_of(trip_id: str, resort_id: str, now: datetime, store: SkiStore) -> Conditions:
    for item in conditions.trip_conditions(trip_id, now, store):
        if item.trip_resort.resort.id == resort_id:
            return item
    raise ResortNotOnTripError(resort_id)


def add_trip_resort(
    trip_id: str, resort_id: str, nights: int | None, now: datetime, store: SkiStore
) -> Conditions:
    """Raises ``ResortNotFoundError`` (unknown or inactive) or ``ResortAlreadyAddedError``."""
    if nights is not None and not 0 <= nights <= 365:
        raise InvalidSkiInputError("nights must be between 0 and 365")
    if store.get_resort(resort_id) is None:
        raise ResortNotFoundError(resort_id)
    store.add_trip_resort(trip_id, resort_id, nights)
    return _conditions_of(trip_id, resort_id, now, store)


def update_trip_resort(
    trip_id: str, resort_id: str, changes: dict[str, int | None], now: datetime, store: SkiStore
) -> Conditions:
    """``changes`` holds only the fields to set. Raises ``ResortNotOnTripError``."""
    if store.update_trip_resort(trip_id, resort_id, changes) is None:
        raise ResortNotOnTripError(resort_id)
    return _conditions_of(trip_id, resort_id, now, store)


def remove_trip_resort(trip_id: str, resort_id: str, store: SkiStore) -> None:
    """Reports of the resort are kept. Raises ``ResortNotOnTripError``."""
    if not store.remove_trip_resort(trip_id, resort_id):
        raise ResortNotOnTripError(resort_id)
