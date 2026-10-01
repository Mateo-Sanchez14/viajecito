from trips import domain
from trips.ports import TripStore


def set_participation(
    trip_id: str, person_id: str, rsvp: str, store: TripStore
) -> domain.ParticipantData:
    return store.set_rsvp(trip_id, person_id, domain.validate_rsvp(rsvp))
