from trips.domain import TripData
from trips.ports import CoverProcessor, TripStore
from trips.use_cases.get_trip import TripNotFoundError


def set_trip_cover(
    trip_id: str, data: bytes, store: TripStore, process: CoverProcessor
) -> TripData:
    """Process the uploaded image and make it the trip's cover (replacing any previous one).

    Raises ``InvalidCoverError`` (from ``process``) before anything is stored, so a rejected upload
    leaves the current cover and its version untouched; ``TripNotFoundError`` for an unknown trip.
    The caller authorizes the actor.
    """
    if store.get(trip_id) is None:
        raise TripNotFoundError(trip_id)
    return store.set_cover(trip_id, process(data))
