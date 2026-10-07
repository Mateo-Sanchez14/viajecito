from trips.ports import TripStore


def read_trip_cover(trip_id: str, store: TripStore) -> bytes | None:
    """The cover's WebP bytes, or ``None`` when the trip has no cover."""
    return store.read_cover(trip_id)
