from trips.domain import TripData
from trips.ports import TripStore


def list_active_trips(store: TripStore) -> list[TripData]:
    """Planning, booked and ongoing trips across all crews."""
    return store.list_active()
