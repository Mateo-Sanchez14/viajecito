import hashlib
import hmac
import json

import pytest
from django.test import Client

from crews.models import Crew, WhatsAppGroupLink

SECRET = "hook-secret"
CHAT = "120363000000000000@g.us"


def sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture(autouse=True)
def webhook_settings(settings):
    settings.GOWA_WEBHOOK_SECRET = SECRET
    settings.GOWA_BASE_URL = "http://gowa.test"
    settings.GOWA_DEVICE_ID = ""
    settings.MESSAGING_PROCESS_SYNC = False


@pytest.fixture
def client():
    return Client()


@pytest.fixture
def crew(db):
    crew = Crew.objects.create(name="Los Pibes")
    WhatsAppGroupLink.objects.create(crew=crew, chat_id=CHAT)
    return crew


def post_signed(client, payload, *, secret: str = SECRET, header: str | None = "auto"):
    raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    extra = {}
    if header == "auto":
        extra["HTTP_X_HUB_SIGNATURE_256"] = sign(raw, secret)
    elif header is not None:
        extra["HTTP_X_HUB_SIGNATURE_256"] = header
    return client.post("/hooks/gowa/", data=raw, content_type="application/json", **extra)
