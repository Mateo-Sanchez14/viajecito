from trips import ports
from trips.domain import ParticipantData
from trips.use_cases.get_trip import TripNotFoundError


def trip_participants(trip_id: str) -> list[ParticipantData]:
    """Every ACTIVE member of the trip's crew with their RSVP (``pending`` without a row);
    ``display_name`` falls back to the phone. Raises ``TripNotFoundError`` for an unknown trip."""
    store = ports.default_store()
    if store.get(trip_id) is None:
        raise TripNotFoundError(trip_id)
    return store.participants(trip_id)
