"""decisions' single bridge to the trips, crews and identity use cases."""

from datetime import date

from decisions.domain.rules import Participant, PersonRef, TripInfo
from identity.use_cases.display_names import display_names
from trips.use_cases.list_active_trips import list_active_trips
from trips.use_cases.trip_participants import trip_participants
from trips.use_cases.update_trip import update_trip


class CoreTripGateway:
    def participants(self, trip_id: str) -> list[Participant]:
        return [
            Participant(p.person_id, p.display_name, p.rsvp) for p in trip_participants(trip_id)
        ]

    def set_trip_dates(self, trip_id: str, actor_id: str, start_on: date, end_on: date) -> None:
        update_trip(trip_id, actor_id, start_on=start_on, end_on=end_on)

    def names(self, person_ids: list[str]) -> dict[str, PersonRef]:
        found = display_names(person_ids)
        return {pid: PersonRef(pid, name) for pid, name in found.items()}

    def active_trips(self) -> list[TripInfo]:
        return [
            TripInfo(t.id, t.crew_id, t.name, t.timezone, t.start_on, t.end_on)
            for t in list_active_trips()
        ]
