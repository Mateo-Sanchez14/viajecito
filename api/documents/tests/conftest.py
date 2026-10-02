import json
from datetime import date

import pytest
from django.test import Client

from crews.models import Crew, CrewMembership, WhatsAppGroupLink
from identity.models import Person
from messaging.handlers import commands
from messaging.reminders import isolated as reminders_isolated
from shared import events
from trips.models import Participation, Trip

CHAT = "120363000000000000@g.us"


def join(crew, person, role="member", status="active"):
    return CrewMembership.objects.create(
        crew=crew, person=person, role=role, source="bootstrap", status=status
    )


@pytest.fixture(autouse=True)
def isolated_registries():
    with reminders_isolated(), commands.isolated(), events.isolated():
        yield


@pytest.fixture
def crew(db):
    crew = Crew.objects.create(name="Los Pibes", timezone="America/Argentina/Buenos_Aires")
    WhatsAppGroupLink.objects.create(crew=crew, chat_id=CHAT)
    return crew


@pytest.fixture
def other_crew(db):
    return Crew.objects.create(name="Los Otros")


@pytest.fixture
def ana(crew):
    person = Person.objects.create_user("+5491155551111", display_name="Ana")
    join(crew, person, role="admin")
    return person


@pytest.fixture
def beto(crew):
    person = Person.objects.create_user("+5491155552222", display_name="Beto")
    join(crew, person)
    return person


@pytest.fixture
def cleo(crew):
    person = Person.objects.create_user("+5491155553333", display_name="Cleo")
    join(crew, person)
    return person


@pytest.fixture
def stranger(other_crew):
    person = Person.objects.create_user("+5491155559999", display_name="Extra")
    join(other_crew, person)
    return person


@pytest.fixture
def trip(crew, ana):
    return Trip.objects.create(crew=crew, name="Verano 2027")


@pytest.fixture
def as_person():
    def build(person):
        client = Client()
        client.force_login(person)
        return client

    return build


@pytest.fixture
def anon():
    return Client()


def send(client, method, path, payload=None):
    if method == "get":
        return client.get(path, data=payload or {})
    return getattr(client, method)(
        path, data=json.dumps(payload or {}), content_type="application/json"
    )


def rsvp(trip, person, value):
    Participation.objects.update_or_create(trip=trip, person=person, defaults={"rsvp": value})


WINDOW = {"window_start": "2026-07-01", "window_end": "2026-07-31", "min_days": 7}


def open_payload(**overrides):
    return {"kind": "dates", **WINDOW, **overrides}


def iso(value: date) -> str:
    return value.isoformat()
