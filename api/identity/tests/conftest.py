import json
import re

import httpx
import pytest
import respx
from django.test import Client

from crews.models import Crew, CrewMembership, Invite
from identity.models import Person

GOWA = "http://gowa.test"
MEMBER_PHONE = "+5491155551234"
STRANGER_PHONE = "+5491155559999"
CODE_RE = re.compile(r"\b(\d{6})\b")


@pytest.fixture(autouse=True)
def gowa_settings(settings):
    settings.GOWA_BASE_URL = GOWA
    settings.OTP_DELIVERY_ENABLED = True
    settings.OTP_SEND_SYNC = True


@pytest.fixture
def gowa():
    """Mocked Gowa ``/send/message``; use ``gowa.codes()`` to read the delivered OTP codes."""
    with respx.mock(assert_all_called=False) as router:
        route = router.post(f"{GOWA}/send/message").mock(
            return_value=httpx.Response(
                200, json={"code": "SUCCESS", "results": {"message_id": "WA1", "status": "sent"}}
            )
        )
        route.codes = lambda: [
            CODE_RE.search(json.loads(call.request.content)["message"]).group(1)
            for call in route.calls
        ]
        route.recipients = lambda: [
            json.loads(call.request.content)["phone"] for call in route.calls
        ]
        yield route


@pytest.fixture
def client():
    return Client()


@pytest.fixture
def strict_client():
    return Client(enforce_csrf_checks=True)


@pytest.fixture
def crew(db):
    return Crew.objects.create(name="Los Pibes")


@pytest.fixture
def member(crew):
    person = Person.objects.create_user(MEMBER_PHONE, display_name="Mateo")
    CrewMembership.objects.create(crew=crew, person=person, role="admin", source="bootstrap")
    return person


@pytest.fixture
def invite(crew):
    return Invite.objects.create(crew=crew, phone=STRANGER_PHONE)


def post_json(client, path, payload, **extra):
    return client.post(path, data=json.dumps(payload), content_type="application/json", **extra)


def request_otp(client, phone, **extra):
    return post_json(client, "/api/auth/otp/request", {"phone": phone}, **extra)


def verify_otp(client, phone, code, **extra):
    return post_json(client, "/api/auth/otp/verify", {"phone": phone, "code": code}, **extra)
