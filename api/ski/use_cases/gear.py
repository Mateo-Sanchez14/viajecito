"""A member's own gear plan."""

from ski import domain
from ski.domain import GearInput, GearRecord
from ski.ports import SkiStore


def set_my_gear(
    trip_id: str, person_id: str, items: list[GearInput], currency: str, store: SkiStore
) -> list[GearRecord]:
    """Replace all of the person's rows. Raises ``InvalidSkiInputError`` (nothing is changed)."""
    clean = domain.validate_gear(items, currency)
    return store.replace_gear(trip_id, person_id, clean)
