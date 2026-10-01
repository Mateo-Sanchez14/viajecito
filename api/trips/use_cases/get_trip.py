from trips import plugins
from trips.domain import TripDetail
from trips.ports import TripStore


class TripNotFoundError(LookupError):
    """No trip with this id."""


def get_trip(trip_id: str, person_id: str, store: TripStore) -> TripDetail:
    trip = store.get(trip_id)
    if trip is None:
        raise TripNotFoundError(trip_id)
    participants = store.participants(trip_id)
    mine = next((p.rsvp for p in participants if p.person_id == person_id), "pending")
    return TripDetail(
        trip=trip,
        modules=plugins.modules_for(trip.type),
        participants=participants,
        my_rsvp=mine,
    )
