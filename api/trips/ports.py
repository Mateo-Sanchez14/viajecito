from datetime import date
from typing import Any, Protocol

from trips.domain import ParticipantData, TripData


class TripStore(Protocol):
    def create(
        self,
        crew_id: str,
        creator_id: str,
        *,
        name: str,
        type: str,
        start_on: date | None,
        end_on: date | None,
        destination_label: str,
        currency: str,
    ) -> TripData:
        """Create the trip (timezone from the crew), enroll the creator as ``in`` and make it the
        crew's default trip when the crew has none. One atomic step."""
        ...

    def list_for_crew(self, crew_id: str) -> list[TripData]: ...

    def get(self, trip_id: str) -> TripData | None: ...

    def update(self, trip_id: str, changes: dict[str, Any]) -> TripData: ...

    def participants(self, trip_id: str) -> list[ParticipantData]: ...

    def set_rsvp(self, trip_id: str, person_id: str, rsvp: str) -> ParticipantData:
        """Create or update the person's participation."""
        ...
