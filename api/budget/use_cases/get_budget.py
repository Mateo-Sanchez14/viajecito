from budget.domain.forecast import forecast
from proposals.use_cases.list_trip_proposals import list_trip_proposals
from trips.use_cases.get_trip_snapshot import get_trip_snapshot
from trips.use_cases.trip_participants import trip_participants


def get_budget(trip_id):
    trip = get_trip_snapshot(trip_id)
    if trip is None:
        raise LookupError("Trip not found")
    return forecast(
        list_trip_proposals(trip_id, statuses=("chosen", "booked")),
        trip,
        trip_participants(trip_id),
    )
