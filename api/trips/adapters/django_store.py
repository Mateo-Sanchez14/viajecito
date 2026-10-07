from datetime import date
from typing import Any
from uuid import uuid4

from django.core.files.base import ContentFile
from django.db import transaction

from crews.models import Crew, CrewMembership
from trips.domain import ACTIVE_STATUSES, ParticipantData, TripData
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
        fx_rates=dict(trip.fx_rates),
        has_cover=bool(trip.cover),
        cover_version=trip.cover_version,
    )


def participant_data(person, rsvp: str) -> ParticipantData:
    return ParticipantData(
        person_id=str(person.pk), display_name=person.display_name or person.phone, rsvp=rsvp
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

    def list_active(self) -> list[TripData]:
        trips = Trip.objects.filter(status__in=ACTIVE_STATUSES).order_by("created_at", "pk")
        return [trip_data(t) for t in trips]

    def default_trip_id(self, crew_id: str) -> str | None:
        value = Crew.objects.filter(pk=crew_id).values_list("default_trip_id", flat=True).first()
        return str(value) if value else None

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
        """Every ACTIVE member of the trip's crew; ``pending`` when they have no row yet."""
        trip = Trip.objects.get(pk=trip_id)
        rsvps = dict(Participation.objects.filter(trip_id=trip_id).values_list("person_id", "rsvp"))
        members = (
            CrewMembership.objects.filter(crew_id=trip.crew_id, status=CrewMembership.Status.ACTIVE)
            .select_related("person")
            .order_by("created_at", "pk")
        )
        return [
            participant_data(m.person, rsvps.get(m.person_id, Participation.Rsvp.PENDING))
            for m in members
        ]

    def set_rsvp(self, trip_id: str, person_id: str, rsvp: str) -> ParticipantData:
        row, _ = Participation.objects.update_or_create(
            trip_id=trip_id, person_id=person_id, defaults={"rsvp": rsvp}
        )
        return participant_data(row.person, row.rsvp)

    def set_cover(self, trip_id: str, webp: bytes) -> TripData:
        with transaction.atomic():
            trip = Trip.objects.get(pk=trip_id)
            storage = trip.cover.storage
            old_name = trip.cover.name if trip.cover else ""
            trip.cover.save(f"{uuid4()}.webp", ContentFile(webp), save=False)
            new_name = trip.cover.name
            trip.cover_version += 1
            try:
                trip.save(update_fields=["cover", "cover_version"])
            except Exception:
                storage.delete(new_name)  # the row was not updated: do not orphan the new file
                raise
            if old_name:
                transaction.on_commit(lambda: storage.delete(old_name))
        return trip_data(trip)

    def clear_cover(self, trip_id: str) -> TripData:
        with transaction.atomic():
            trip = Trip.objects.get(pk=trip_id)
            if trip.cover:
                storage = trip.cover.storage
                old_name = trip.cover.name
                trip.cover = None
                trip.cover_version += 1
                trip.save(update_fields=["cover", "cover_version"])
                transaction.on_commit(lambda: storage.delete(old_name))
        return trip_data(trip)

    def read_cover(self, trip_id: str) -> bytes | None:
        trip = Trip.objects.filter(pk=trip_id).first()
        if trip is None or not trip.cover:
            return None
        try:
            with trip.cover.open("rb") as handle:
                return handle.read()
        except OSError:
            return None
