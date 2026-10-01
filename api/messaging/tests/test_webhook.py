import threading
from datetime import UTC, datetime

import pytest
from django.db import connections

from messaging.adapters import wiring
from messaging.models import InboundMessage
from messaging.tests.conftest import post_signed
from messaging.tests.gowa_fixtures import load


@pytest.fixture
def scheduled(monkeypatch):
    calls: list[int] = []

    class Recorder:
        def schedule(self, inbound_id: int) -> None:
            calls.append(inbound_id)

    monkeypatch.setattr(wiring, "process_scheduler", lambda: Recorder())
    return calls


@pytest.mark.django_db
def test_bad_signature_is_403_and_stores_nothing(client, crew, scheduled):
    response = post_signed(client, load("group_command_ping.json"), secret="wrong")
    assert response.status_code == 403
    assert response.json() == {"code": "invalid_signature"}
    assert InboundMessage.objects.count() == 0 and scheduled == []


@pytest.mark.django_db
def test_missing_signature_is_403(client, crew):
    response = post_signed(client, load("group_command_ping.json"), header=None)
    assert (response.status_code, response.json()) == (403, {"code": "invalid_signature"})


@pytest.mark.django_db
def test_empty_secret_fails_closed(client, crew, settings):
    settings.GOWA_WEBHOOK_SECRET = ""
    response = post_signed(client, load("group_command_ping.json"), secret="")
    assert response.status_code == 403


@pytest.mark.django_db
def test_invalid_json_is_400(client, crew):
    response = post_signed(client, b"{not json")
    assert (response.status_code, response.json()) == (400, {"code": "invalid_payload"})


@pytest.mark.django_db
def test_json_that_is_not_an_object_is_400(client, crew):
    assert post_signed(client, b"[1, 2]").status_code == 400


@pytest.mark.django_db
def test_get_is_405(client):
    assert client.get("/hooks/gowa/").status_code == 405


@pytest.mark.django_db
def test_csrf_does_not_apply(crew):
    from django.test import Client

    response = post_signed(Client(enforce_csrf_checks=True), load("message_ack.json"))
    assert response.status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("fixture", "reason"),
    [
        ("message_ack.json", "event"),
        ("group_own_message.json", "own_message"),
        ("dm_text.json", "not_group"),
    ],
)
def test_ignored_events_store_nothing(client, crew, scheduled, fixture, reason):
    response = post_signed(client, load(fixture))
    assert response.status_code == 200
    assert response.json() == {"status": "ignored", "reason": reason}
    assert InboundMessage.objects.count() == 0 and scheduled == []


@pytest.mark.django_db
def test_unlinked_group_is_ignored_without_a_row(client, db, scheduled):
    response = post_signed(client, load("group_command_ping.json"))
    assert response.json() == {"status": "ignored", "reason": "unlinked_group"}
    assert InboundMessage.objects.count() == 0 and scheduled == []


@pytest.mark.django_db
def test_malformed_message_is_ignored(client, crew):
    response = post_signed(client, {"event": "message", "payload": {"chat_id": "x@g.us"}})
    assert response.status_code == 200
    assert response.json()["status"] == "ignored"
    assert InboundMessage.objects.count() == 0


@pytest.mark.django_db
def test_accepts_a_group_message_and_schedules_processing(client, crew, scheduled):
    payload = load("group_text_with_device_suffix.json")
    response = post_signed(client, payload)
    assert response.json() == {"status": "accepted"}
    row = InboundMessage.objects.get()
    assert scheduled == [row.pk]
    assert (row.status, row.event, row.attempts) == ("received", "message", 0)
    assert row.device_id == "5491100000009@s.whatsapp.net"
    assert row.gowa_message_id == "3EB0AAAA0000000007"
    assert row.chat_id == "120363000000000000@g.us"
    assert row.sender_jid == "5491100000001@s.whatsapp.net"
    assert row.sender_lid == "251556000000001@lid"
    assert (row.sender_name, row.body) == ("Fake Friend", "/viaje ping")
    assert row.raw == payload


@pytest.mark.django_db
def test_duplicate_delivery_is_200_with_one_row_and_one_schedule(client, crew, scheduled):
    payload = load("group_command_ping.json")
    first = post_signed(client, payload)
    second = post_signed(client, payload)
    assert (first.json(), second.json()) == ({"status": "accepted"}, {"status": "duplicate"})
    assert second.status_code == 200
    assert InboundMessage.objects.count() == 1 and len(scheduled) == 1


@pytest.mark.django_db
def test_sent_at_is_stored_from_the_payload_timestamp(client, crew, scheduled):
    post_signed(client, load("group_command_ping.json"))
    assert InboundMessage.objects.get().sent_at == datetime(2025, 10, 15, 10, 30, tzinfo=UTC)


@pytest.mark.django_db
def test_sent_at_is_null_without_a_timestamp(client, crew, scheduled):
    payload = load("group_command_ping.json")
    del payload["payload"]["timestamp"]
    post_signed(client, payload)
    assert InboundMessage.objects.get().sent_at is None


@pytest.mark.django_db(transaction=True)
def test_simultaneous_deliveries_of_the_same_message_store_one_row(crew, scheduled):
    from django.test import Client

    payload = load("group_command_ping.json")
    barrier = threading.Barrier(2)
    answers: list[dict] = []
    errors: list[BaseException] = []

    def deliver():
        try:
            client = Client()
            barrier.wait(timeout=5)
            answers.append(post_signed(client, payload).json())
        except BaseException as exc:  # surfaced below
            errors.append(exc)
        finally:
            connections.close_all()

    threads = [threading.Thread(target=deliver) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)
    assert errors == []
    assert sorted(a["status"] for a in answers) == ["accepted", "duplicate"]
    assert InboundMessage.objects.count() == 1 and len(scheduled) == 1
