from datetime import date
from typing import Any

from django.db import transaction

from crews.models import Crew
from trips.domain import ParticipantData, TripData
from trips.models import Participation, Trip


def trip_data(trip: Trip) -> TripData:
    return TripData(
        id=str(trip.pk),
        crew_id=str(trip.crew_id),
        name=trip.name,
        type=trip.type,
        status=trip.status,
        start_on=trip.start_on,
        end_on=trip.end_on,
        destination_label=trip.destination_label,
        timezone=trip.timezone,
        currency=trip.currency,
    )


def participant_data(row: Participation) -> ParticipantData:
    return ParticipantData(
        person_id=str(row.person_id), display_name=row.person.display_name, rsvp=row.rsvp
    )


class DjangoTripStore:
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
        with transaction.atomic():
            trip = Trip.objects.create(
                crew_id=crew_id,
                name=name,
                type=type,
                start_on=start_on,
                end_on=end_on,
                destination_label=destination_label,
                currency=currency,
            )
            Participation.objects.create(
                trip=trip, person_id=creator_id, rsvp=Participation.Rsvp.IN
            )
            Crew.objects.filter(pk=crew_id, default_trip__isnull=True).update(default_trip=trip)
        return trip_data(trip)

    def list_for_crew(self, crew_id: str) -> list[TripData]:
        return [trip_data(t) for t in Trip.objects.filter(crew_id=crew_id)]

    def get(self, trip_id: str) -> TripData | None:
        trip = Trip.objects.filter(pk=trip_id).first()
        return trip_data(trip) if trip else None

    def update(self, trip_id: str, changes: dict[str, Any]) -> TripData:
        trip = Trip.objects.get(pk=trip_id)
        for field, value in changes.items():
            setattr(trip, field, value)
        trip.save()
        return trip_data(trip)

    def participants(self, trip_id: str) -> list[ParticipantData]:
        rows = Participation.objects.filter(trip_id=trip_id).select_related("person")
        return [participant_data(row) for row in rows.order_by("joined_at", "pk")]

    def set_rsvp(self, trip_id: str, person_id: str, rsvp: str) -> ParticipantData:
        row, _ = Participation.objects.update_or_create(
            trip_id=trip_id, person_id=person_id, defaults={"rsvp": rsvp}
        )
        return participant_data(row)
