from typing import Any

from trips import domain, plugins, ports
from trips.ports import TripStore
from trips.use_cases.get_trip import TripNotFoundError

ALLOWED_FIELDS = (
    "name",
    "type",
    "status",
    "start_on",
    "end_on",
    "destination_label",
    "currency",
    "fx_rates",
)
NOT_NULLABLE = ("name", "type", "status", "currency", "destination_label", "fx_rates")


def update_trip(trip_id: str, actor_id: str, **fields: Any) -> domain.TripRef:
    """Partially update a trip; callable from other apps (M2 writes the chosen dates).

    Only the given fields change. Raises ``InvalidTripInputError`` for unknown or invalid fields and
    ``TripNotFoundError`` for an unknown trip. The caller authorizes the actor (``member_of_trip``
    on the HTTP side); ``actor_id`` identifies who changed the trip.
    """
    return apply_trip_update(trip_id, fields, ports.default_store())


def apply_trip_update(trip_id: str, changes: dict[str, Any], store: TripStore) -> domain.TripData:
    current = store.get(trip_id)
    if current is None:
        raise TripNotFoundError(trip_id)
    unknown = sorted(set(changes) - set(ALLOWED_FIELDS))
    if unknown:
        raise domain.InvalidTripInputError(f"unknown trip fields: {', '.join(unknown)}")
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
    if "fx_rates" in changes:
        clean["fx_rates"] = domain.validate_fx_rates(changes["fx_rates"])
    for field in ("start_on", "end_on"):
        if field in changes:
            clean[field] = changes[field]
    domain.validate_dates(
        clean.get("start_on", current.start_on), clean.get("end_on", current.end_on)
    )
    return store.update(trip_id, clean) if clean else current
