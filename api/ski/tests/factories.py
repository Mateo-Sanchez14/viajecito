"""Plain helpers that build rows for tests."""

from datetime import date
from decimal import Decimal

from crews.models import Crew, CrewMembership
from identity.models import Person
from ski.models import Resort, TripResort
from trips.models import Participation, Trip

_counter = {"n": 0}


def make_resort(slug="cerro-catedral", **extra) -> Resort:
    fields = dict(
        slug=slug,
        name=slug.replace("-", " ").title(),
        country="AR",
        lat=Decimal("-41.17"),
        lng=Decimal("-71.44"),
        base_elev_m=1030,
        summit_elev_m=2100,
        timezone="America/Argentina/Salta",
    )
    return Resort.objects.create(**{**fields, **extra})


def make_crew(name="Los Pibes") -> Crew:
    return Crew.objects.create(name=name, timezone="America/Argentina/Buenos_Aires")


def make_person(display_name="Ana", crew=None, role="member") -> Person:
    _counter["n"] += 1
    person = Person.objects.create_user(f"+54911555{_counter['n']:05d}", display_name=display_name)
    if crew is not None:
        CrewMembership.objects.create(
            crew=crew, person=person, role=role, source="bootstrap", status="active"
        )
    return person


def make_trip(
    crew=None,
    *,
    type="ski",
    status="planning",
    start_on: date | None = None,
    end_on: date | None = None,
    resorts=(),
    name="Bariloche",
) -> Trip:
    crew = crew or make_crew()
    trip = Trip.objects.create(
        crew=crew, name=name, type=type, status=status, start_on=start_on, end_on=end_on
    )
    for position, resort in enumerate(resorts):
        TripResort.objects.create(trip=trip, resort=resort, position=position)
    return trip


def rsvp(trip, person, value="in") -> Participation:
    return Participation.objects.update_or_create(
        trip=trip, person=person, defaults={"rsvp": value}
    )[0]
