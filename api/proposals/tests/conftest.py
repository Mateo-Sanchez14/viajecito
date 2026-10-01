import json
from pathlib import Path

import pytest
from django.test import Client

from crews.models import Crew, CrewMembership, WhatsAppGroupLink
from identity.models import Person, WhatsAppIdentity
from linkpreview.adapters.fake_fetcher import FakeFetcher
from proposals.adapters.django_store import DjangoProposalStore
from proposals.models import Proposal
from trips.models import Participation, Trip

CHAT = "120363000000000000@g.us"
FIXTURES = Path(__file__).parent / "fixtures" / "gowa"
ORIGIN = "https://viajecito.example.com"


@pytest.fixture(autouse=True)
def proposals_settings(settings, tmp_path):
    settings.LINKPREVIEW_FETCHER = "fake"
    settings.LINKPREVIEW_FETCH_SYNC = True
    settings.MEDIA_ROOT = tmp_path / "media"
    settings.PUBLIC_ORIGIN = ORIGIN
    settings.MESSAGING_PROCESS_SYNC = True
    settings.GOWA_WEBHOOK_SECRET = "hook-secret"
    settings.GOWA_BASE_URL = "http://gowa.test"
    settings.GOWA_DEVICE_ID = ""
    FakeFetcher.reset()
    yield
    FakeFetcher.reset()


@pytest.fixture
def fake():
    return FakeFetcher


@pytest.fixture
def store():
    return DjangoProposalStore()


@pytest.fixture
def crew(db):
    crew = Crew.objects.create(name="Los Pibes", timezone="America/Argentina/Buenos_Aires")
    WhatsAppGroupLink.objects.create(crew=crew, chat_id=CHAT)
    return crew


def member(crew, phone, name, jid_digits):
    person = Person.objects.create_user(phone, display_name=name)
    WhatsAppIdentity.objects.create(person=person, jid=f"{jid_digits}@s.whatsapp.net")
    CrewMembership.objects.create(crew=crew, person=person, source="invite")
    return person


@pytest.fixture
def ana(crew):
    return member(crew, "+5491100000001", "Ana", "5491100000001")


@pytest.fixture
def beto(crew):
    return member(crew, "+5491100000002", "Beto", "5491100000002")


@pytest.fixture
def cris(crew):
    return member(crew, "+5491100000003", "Cris", "5491100000003")


@pytest.fixture
def trip(crew, ana, beto, cris):
    """The crew's default trip; all three members are ``in``."""
    trip = Trip.objects.create(crew=crew, name="Bariloche", currency="ARS")
    for person in (ana, beto, cris):
        Participation.objects.create(trip=trip, person=person, rsvp="in")
    crew.default_trip = trip
    crew.save()
    # A synced roster keeps unknown-sender handling from calling Gowa's roster endpoint.
    WhatsAppGroupLink.objects.filter(crew=crew).update(last_synced_at="2099-01-01T00:00:00Z")
    return trip


@pytest.fixture
def make_proposal(trip, ana):
    def build(**overrides) -> Proposal:
        values = {"trip": trip, "author": ana, "title": "Cabañas del Sur", "category": "lodging"}
        return Proposal.objects.create(**{**values, **overrides})

    return build


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


def gowa_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def send(client, method, path, payload=None):
    kwargs = {} if payload is None else {"data": json.dumps(payload)}
    return getattr(client, method)(path, content_type="application/json", **kwargs)
