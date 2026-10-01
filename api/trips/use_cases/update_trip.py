from typing import Any

from trips import domain, plugins
from trips.ports import TripStore
from trips.use_cases.get_trip import TripNotFoundError

NOT_NULLABLE = ("name", "type", "status", "currency", "destination_label")


def update_trip(trip_id: str, changes: dict[str, Any], store: TripStore) -> domain.TripData:
    """Apply a partial update. ``changes`` holds only the fields the caller sent."""
    current = store.get(trip_id)
    if current is None:
        raise TripNotFoundError(trip_id)
    for field in NOT_NULLABLE:
        if field in changes and changes[field] is None:
            raise domain.InvalidTripInputError(f"{field} must not be null")
    clean: dict[str, Any] = {}
    if "name" in changes:
        clean["name"] = domain.validate_name(changes["name"])
    if "type" in changes:
        if not plugins.is_registered(changes["type"]):
            raise domain.InvalidTripInputError(f"unknown trip type {changes['type']!r}")
        clean["type"] = changes["type"]
    if "status" in changes:
        clean["status"] = domain.validate_status(changes["status"])
    if "currency" in changes:
        clean["currency"] = domain.normalize_currency(changes["currency"])
    if "destination_label" in changes:
        clean["destination_label"] = changes["destination_label"].strip()
    for field in ("start_on", "end_on"):
        if field in changes:
            clean[field] = changes[field]
    domain.validate_dates(
        clean.get("start_on", current.start_on), clean.get("end_on", current.end_on)
    )
    return store.update(trip_id, clean) if clean else current
