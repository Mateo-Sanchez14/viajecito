from trips import ports
from trips.domain import TripData


def get_trip_snapshot(trip_id: str) -> TripData | None:
    """Read any lifecycle status for trusted callers; authorization belongs to the caller."""
    return ports.default_store().get(trip_id)
