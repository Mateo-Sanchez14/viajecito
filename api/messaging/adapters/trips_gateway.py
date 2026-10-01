"""Bridges messaging to the trips app (its use cases, wired to its Django store)."""

from crews.adapters.django_store import DjangoCrewStore
from crews.use_cases.chat_for_crew import chat_id_for_crew
from messaging.ports import ReminderTrip
from trips.adapters.django_store import DjangoTripStore
from trips.use_cases.list_active_trips import list_active_trips


class TripsGateway:
    def __init__(self) -> None:
        self._trips = DjangoTripStore()
        self._crews = DjangoCrewStore()

    def active_trips(self) -> list[ReminderTrip]:
        result = []
        for trip in list_active_trips(self._trips):
            chat_id = chat_id_for_crew(trip.crew_id, self._crews)
            if chat_id:
                result.append(
                    ReminderTrip(
                        trip_id=trip.id,
                        crew_id=trip.crew_id,
                        chat_id=chat_id,
                        timezone=trip.timezone,
                        start_on=trip.start_on,
                        end_on=trip.end_on,
                    )
                )
        return result
