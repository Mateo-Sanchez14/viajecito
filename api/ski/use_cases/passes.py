"""A member's own lift pass rows."""

from ski import domain
from ski.domain import PassInput, PassRecord
from ski.ports import SkiStore


def set_my_pass(
    trip_id: str, person_id: str, item: PassInput, currency: str, store: SkiStore
) -> PassRecord:
    """Upsert on (trip, person, resort). Raises ``InvalidSkiInputError`` /
    ``ResortNotFoundError`` (a resort that is not on the trip)."""
    clean = domain.validate_pass(item, currency)
    if clean.resort_id is not None:
        on_trip = {link.resort.id for link in store.trip_resorts(trip_id)}
        if clean.resort_id not in on_trip:  # no orphan rows for resorts the trip does not use
            raise domain.ResortNotFoundError(clean.resort_id)
    return store.upsert_pass(trip_id, person_id, clean)


def delete_my_pass(trip_id: str, person_id: str, resort_id: str | None, store: SkiStore) -> None:
    store.delete_pass(trip_id, person_id, resort_id)
