import json
from datetime import date

import pytest
from django.test import Client

from crews.models import Crew, CrewMembership
from identity.models import Person
from trips.models import Trip


@pytest.fixture
def crew(db):
    return Crew.objects.create(name="Crew", timezone="America/Santiago")


@pytest.fixture
def ana(crew):
    person = Person.objects.create_user("+5491100000001", display_name="Ana")
    CrewMembership.objects.create(crew=crew, person=person, source="invite")
    return person


@pytest.fixture
def beto(crew):
    person = Person.objects.create_user("+5491100000002", display_name="Beto")
    CrewMembership.objects.create(crew=crew, person=person, source="invite")
    return person


@pytest.fixture
def outsider(db):
    return Person.objects.create_user("+5491100000003")


@pytest.fixture
def trip(crew, ana):
    return Trip.objects.create(
        crew=crew,
        name="Ski trip",
        start_on=date(2026, 10, 1),
        end_on=date(2026, 10, 3),
        timezone=crew.timezone,
    )


@pytest.fixture
def client_as():
    def factory(person, csrf=False):
        c = Client(enforce_csrf_checks=csrf)
        c.force_login(person)
        return c

    return factory


def send(client, method, url, data=None):
    return getattr(client, method)(
        url, data=json.dumps(data or {}), content_type="application/json"
    )
