from trips import ports
from trips.domain import TripData


def list_active_trips() -> list[TripData]:
    """Planning, booked and ongoing trips across all crews (with crew id, timezone and dates)."""
    return ports.default_store().list_active()
