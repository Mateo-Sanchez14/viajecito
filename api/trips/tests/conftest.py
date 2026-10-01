import json

import pytest
from django.test import Client

from crews.models import Crew, CrewMembership
from identity.models import Person

pytestmark = pytest.mark.django_db


def join(crew, person, role="member", status="active"):
    return CrewMembership.objects.create(
        crew=crew, person=person, role=role, source="bootstrap", status=status
    )


@pytest.fixture
def crew(db):
    return Crew.objects.create(name="Los Pibes", timezone="America/Santiago")


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
def stranger(other_crew):
    person = Person.objects.create_user("+5491155559999", display_name="Extra")
    join(other_crew, person)
    return person


@pytest.fixture
def as_person():
    """Build a logged-in client for a person."""

    def build(person):
        client = Client()
        client.force_login(person)
        return client

    return build


@pytest.fixture
def anon():
    return Client()


def send(client, method, path, payload=None):
    return getattr(client, method)(
        path, data=json.dumps(payload or {}), content_type="application/json"
    )
