from trips.domain import TripData
from trips.ports import TripStore
from trips.use_cases.get_trip import TripNotFoundError


def clear_trip_cover(trip_id: str, store: TripStore) -> TripData:
    """Remove the trip's cover. Idempotent: a trip without a cover is returned unchanged."""
    if store.get(trip_id) is None:
        raise TripNotFoundError(trip_id)
    return store.clear_cover(trip_id)
