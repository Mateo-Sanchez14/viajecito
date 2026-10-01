import uuid

import pytest

from trips.domain import TripData
from trips.models import Participation, Trip
from trips.use_cases.get_trip import TripNotFoundError
from trips.use_cases.list_active_trips import list_active_trips
from trips.use_cases.trip_participants import trip_participants

pytestmark = pytest.mark.django_db


def test_list_active_trips_returns_planning_booked_and_ongoing_trips_of_every_crew(
    crew, other_crew
):
    kept = {
        status: Trip.objects.create(
            crew=crew if status != "ongoing" else other_crew,
            name=status,
            status=status,
            start_on="2026-07-10",
            end_on="2026-07-12",
        )
        for status in ("planning", "booked", "ongoing")
    }
    Trip.objects.create(crew=crew, name="idea", status="idea")
    Trip.objects.create(crew=crew, name="done", status="done")
    result = list_active_trips()
    assert {t.name for t in result} == {"planning", "booked", "ongoing"}
    ongoing = next(t for t in result if t.name == "ongoing")
    assert isinstance(ongoing, TripData)
    assert ongoing.id == str(kept["ongoing"].pk) and ongoing.crew_id == str(other_crew.pk)
    assert (ongoing.timezone, str(ongoing.start_on), str(ongoing.end_on)) == (
        other_crew.timezone,
        "2026-07-10",
        "2026-07-12",
    )


def test_trip_participants_lists_every_active_member_with_name_fallback(crew, ana, beto):
    from crews.models import CrewMembership
    from identity.models import Person

    nameless = Person.objects.create_user("+5491155557777")
    CrewMembership.objects.create(crew=crew, person=nameless, source="invite")
    trip = Trip.objects.create(crew=crew, name="x")
    Participation.objects.create(trip=trip, person=beto, rsvp="maybe")
    rows = {p.person_id: (p.display_name, p.rsvp) for p in trip_participants(str(trip.pk))}
    assert rows == {
        str(ana.pk): ("Ana", "pending"),
        str(beto.pk): ("Beto", "maybe"),
        str(nameless.pk): ("+5491155557777", "pending"),
    }


def test_trip_participants_of_an_unknown_trip_raises():
    with pytest.raises(TripNotFoundError):
        trip_participants(str(uuid.uuid4()))
