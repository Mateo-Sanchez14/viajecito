from datetime import date

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from crews.models import Crew
from identity.models import Person
from trips.models import Participation, Trip

pytestmark = pytest.mark.django_db


@pytest.fixture
def crew():
    return Crew.objects.create(name="Los Pibes", timezone="America/Santiago")


def test_defaults_and_timezone_follows_the_crew(crew):
    trip = Trip.objects.create(crew=crew, name="Bariloche")
    assert (trip.type, trip.status, trip.currency) == ("generic", "planning", "USD")
    assert trip.timezone == "America/Santiago"
    assert (trip.start_on, trip.end_on, trip.destination_label, trip.fx_rates) == (
        None,
        None,
        "",
        {},
    )


def test_explicit_timezone_is_kept(crew):
    trip = Trip.objects.create(crew=crew, name="Lisboa", timezone="Europe/Lisbon")
    assert trip.timezone == "Europe/Lisbon"


def test_clean_rejects_end_before_start(crew):
    trip = Trip(crew=crew, name="x", start_on=date(2026, 7, 10), end_on=date(2026, 7, 1))
    with pytest.raises(ValidationError) as exc:
        trip.full_clean()
    assert "end_on" in exc.value.message_dict


def test_save_uppercases_currency(crew):
    trip = Trip.objects.create(crew=crew, name="x", currency="eur")
    assert Trip.objects.get(pk=trip.pk).currency == "EUR"


def test_participation_defaults_to_pending_and_is_unique(crew):
    trip = Trip.objects.create(crew=crew, name="x")
    person = Person.objects.create_user("+5491155551234")
    row = Participation.objects.create(trip=trip, person=person)
    assert row.rsvp == "pending" and row.joined_at is not None
    with pytest.raises(IntegrityError), transaction.atomic():
        Participation.objects.create(trip=trip, person=person)


def test_deleting_the_default_trip_nulls_the_crew_pointer(crew):
    trip = Trip.objects.create(crew=crew, name="x")
    crew.default_trip = trip
    crew.save()
    trip.delete()
    crew.refresh_from_db()
    assert crew.default_trip_id is None
