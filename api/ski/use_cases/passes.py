"""A member's own lift pass rows."""

from ski import domain
from ski.domain import PassInput, PassRecord
from ski.ports import SkiStore


def set_my_pass(
    trip_id: str, person_id: str, item: PassInput, currency: str, store: SkiStore
) -> PassRecord:
    """Upsert on (trip, person, resort). Raises ``InvalidSkiInputError`` /
    ``ResortNotFoundError`` (a resort id that does not exist)."""
    clean = domain.validate_pass(item, currency)
    if clean.resort_id is not None and store.get_resort(clean.resort_id) is None:
        raise domain.ResortNotFoundError(clean.resort_id)
    return store.upsert_pass(trip_id, person_id, clean)


def delete_my_pass(trip_id: str, person_id: str, resort_id: str | None, store: SkiStore) -> None:
    store.delete_pass(trip_id, person_id, resort_id)
