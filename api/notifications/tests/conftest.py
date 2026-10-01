import base64
import json
from datetime import UTC, datetime

import pytest
from django.test import Client

from crews.models import Crew, CrewMembership
from identity.models import Person
from messaging import reminders
from notifications import ports
from notifications.ports import SendResult, SubscriptionData
from trips.models import Participation, Trip

NOW = datetime(2026, 10, 1, 15, 0, tzinfo=UTC)


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


P256DH = b64(b"\x04" + b"\x01" * 64)
AUTH = b64(b"\x02" * 16)


def sub_body(n: int = 1, host: str = "fcm.googleapis.com", **extra) -> dict:
    return {
        "endpoint": f"https://{host}/fcm/send/device-{n}",
        "keys": {"p256dh": P256DH, "auth": AUTH},
        **extra,
    }


def send(client, method, path, payload=None):
    if method == "get":
        return client.get(path)
    return getattr(client, method)(
        path, data=json.dumps(payload or {}), content_type="application/json"
    )


@pytest.fixture(autouse=True)
def isolated_registries():
    with reminders.isolated():
        yield


@pytest.fixture
def vapid(settings):
    settings.NOTIFICATIONS_VAPID_PUBLIC_KEY = "BPublicKeyForTests"
    settings.NOTIFICATIONS_VAPID_PRIVATE_KEY = "private-key-for-tests"
    settings.NOTIFICATIONS_VAPID_SUBJECT = "mailto:owner@example.test"


class FakeSender:
    """Records sends; ``outcomes`` maps an endpoint to its result (default ok)."""

    def __init__(self):
        self.sent: list[tuple[SubscriptionData, dict]] = []
        self.outcomes: dict[str, str] = {}
        self.raises: Exception | None = None

    def send(self, subscription: SubscriptionData, payload: str) -> SendResult:
        if self.raises is not None:
            raise self.raises
        self.sent.append((subscription, json.loads(payload)))
        return SendResult(self.outcomes.get(subscription.endpoint, "ok"))


@pytest.fixture
def sender(vapid):
    fake = FakeSender()
    with ports.use_sender(fake):
        yield fake


@pytest.fixture
def crew(db):
    return Crew.objects.create(name="Los Pibes", timezone="America/Argentina/Buenos_Aires")


def make_person(crew, phone, name, role="member"):
    person = Person.objects.create_user(phone, display_name=name)
    CrewMembership.objects.create(
        crew=crew, person=person, role=role, source="bootstrap", status="active"
    )
    return person


@pytest.fixture
def ana(crew):
    return make_person(crew, "+5491155551111", "Ana", "admin")


@pytest.fixture
def beto(crew):
    return make_person(crew, "+5491155552222", "Beto")


@pytest.fixture
def caro(crew):
    return make_person(crew, "+5491155553333", "Caro")


@pytest.fixture
def trip(crew, ana, beto, caro):
    trip = Trip.objects.create(crew=crew, name="Bariloche", status="planning")
    Participation.objects.create(trip=trip, person=ana, rsvp="in")
    Participation.objects.create(trip=trip, person=beto, rsvp="maybe")
    Participation.objects.create(trip=trip, person=caro, rsvp="out")
    return trip


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
