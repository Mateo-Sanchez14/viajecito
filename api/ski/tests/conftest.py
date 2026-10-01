import json

import pytest
from django.test import Client

from ski.tests.factories import make_crew, make_person, make_resort, make_trip


@pytest.fixture
def crew(db):
    return make_crew()


@pytest.fixture
def other_crew(db):
    return make_crew("Los Otros")


@pytest.fixture
def ana(crew):
    return make_person("Ana", crew, role="admin")


@pytest.fixture
def beto(crew):
    return make_person("Beto", crew)


@pytest.fixture
def stranger(other_crew):
    return make_person("Extra", other_crew)


@pytest.fixture
def catedral(db):
    return make_resort("cerro-catedral", name="Cerro Catedral")


@pytest.fixture
def valle(db):
    return make_resort(
        "valle-nevado", name="Valle Nevado", country="CL", timezone="America/Santiago"
    )


@pytest.fixture
def trip(crew, catedral):
    return make_trip(crew, resorts=[catedral])


@pytest.fixture
def as_person():
    def build(person, **client_kwargs):
        client = Client(**client_kwargs)
        client.force_login(person)
        return client

    return build


@pytest.fixture
def anon():
    return Client()


def send(client, method, path, payload=None):
    if method in ("get", "delete"):
        return getattr(client, method)(path)
    return getattr(client, method)(
        path,
        data=json.dumps(payload if payload is not None else {}),
        content_type="application/json",
    )


@pytest.fixture(autouse=True)
def no_seeded_resorts(db):
    """The data migration seeds the real resorts; tests build their own."""
    from ski.models import Resort

    Resort.objects.all().delete()
