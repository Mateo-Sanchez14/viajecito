"""``POST /hooks/waha/``: same filtering and ledger behavior as the Gowa hook."""

import hashlib
import hmac
import json

import pytest

from crews.models import Crew, WhatsAppGroupLink
from messaging.adapters import wiring
from messaging.models import InboundMessage
from messaging.tests.waha_fixtures import load

KEY = "waha-hmac-key"
CHAT = "120363000000000000@g.us"


def sign(body: bytes, key: str = KEY) -> str:
    return hmac.new(key.encode(), body, hashlib.sha512).hexdigest()


@pytest.fixture(autouse=True)
def waha_settings(settings):
    settings.WAHA_WEBHOOK_HMAC_KEY = KEY
    settings.MESSAGING_PROCESS_SYNC = False


@pytest.fixture
def crew(db):
    crew = Crew.objects.create(name="Los Pibes")
    WhatsAppGroupLink.objects.create(crew=crew, chat_id=CHAT)
    return crew


@pytest.fixture
def scheduled(monkeypatch):
    calls: list[int] = []

    class Recorder:
        def schedule(self, inbound_id: int) -> None:
            calls.append(inbound_id)

    monkeypatch.setattr(wiring, "process_scheduler", lambda: Recorder())
    return calls


def post(client, payload, *, key: str = KEY, header: str | None = "auto"):
    raw = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    extra = {}
    if header == "auto":
        extra["HTTP_X_WEBHOOK_HMAC"] = sign(raw, key)
        extra["HTTP_X_WEBHOOK_HMAC_ALGORITHM"] = "sha512"
    elif header is not None:
        extra["HTTP_X_WEBHOOK_HMAC"] = header
    return client.post("/hooks/waha/", data=raw, content_type="application/json", **extra)


@pytest.mark.django_db
def test_bad_signature_is_403_and_stores_nothing(client, crew, scheduled):
    response = post(client, load("group_text.json"), key="wrong")
    assert (response.status_code, response.json()) == (403, {"code": "invalid_signature"})
    assert InboundMessage.objects.count() == 0 and scheduled == []


@pytest.mark.django_db
def test_missing_signature_is_403(client, crew):
    assert post(client, load("group_text.json"), header=None).status_code == 403


@pytest.mark.django_db
def test_empty_key_fails_closed(client, crew, settings):
    settings.WAHA_WEBHOOK_HMAC_KEY = ""
    assert post(client, load("group_text.json"), key="").status_code == 403


@pytest.mark.django_db
def test_a_non_sha512_algorithm_header_is_rejected(client, crew):
    raw = json.dumps(load("group_text.json")).encode()
    response = client.post(
        "/hooks/waha/",
        data=raw,
        content_type="application/json",
        HTTP_X_WEBHOOK_HMAC=sign(raw),
        HTTP_X_WEBHOOK_HMAC_ALGORITHM="sha256",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_invalid_json_is_400(client, crew):
    response = post(client, b"{not json")
    assert (response.status_code, response.json()) == (400, {"code": "invalid_payload"})


@pytest.mark.django_db
def test_get_is_405(client):
    assert client.get("/hooks/waha/").status_code == 405


@pytest.mark.django_db
def test_group_message_is_accepted_stored_once_and_scheduled(client, crew, scheduled):
    payload = load("group_from_lid.json")
    response = post(client, payload)
    assert (response.status_code, response.json()) == (200, {"status": "accepted"})
    row = InboundMessage.objects.get()
    assert (row.device_id, row.chat_id, row.body) == ("default", CHAT, "/viaje ping")
    assert (row.sender_jid, row.sender_lid) == (
        "5491100000001@s.whatsapp.net",
        "251556000000001@lid",
    )
    assert scheduled == [row.pk]
    again = post(client, payload)
    assert again.json() == {"status": "duplicate"}
    assert InboundMessage.objects.count() == 1 and scheduled == [row.pk]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("fixture", "reason"),
    [
        ("session_status.json", "event"),
        ("group_own_message.json", "own_message"),
        ("dm_text.json", "not_group"),
    ],
)
def test_ignored_events(client, crew, scheduled, fixture, reason):
    response = post(client, load(fixture))
    assert response.json() == {"status": "ignored", "reason": reason}
    assert InboundMessage.objects.count() == 0 and scheduled == []


@pytest.mark.django_db
def test_unlinked_group_is_ignored(client, scheduled):
    response = post(client, load("group_text.json"))
    assert response.json() == {"status": "ignored", "reason": "unlinked_group"}
    assert InboundMessage.objects.count() == 0
