import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
import time_machine

from crews.models import CrewMembership
from identity.models import Person, WhatsAppIdentity
from messaging.adapters import wiring
from messaging.models import InboundMessage, OutboundMessage

BASE = "http://gowa.test"
CHAT = "120363000000000000@g.us"
NOW = datetime(2025, 10, 15, 12, 0, tzinfo=UTC)


@pytest.fixture
def gowa():
    with respx.mock(assert_all_called=False) as router:
        router.send = router.post(f"{BASE}/send/message").mock(
            return_value=httpx.Response(
                200, json={"results": {"message_id": "WA1", "status": "sent"}}
            )
        )
        yield router


@pytest.fixture(autouse=True)
def member(crew):
    person = Person.objects.create_user("+5491100000001")
    WhatsAppIdentity.objects.create(person=person, jid="5491100000001@s.whatsapp.net")
    CrewMembership.objects.create(crew=crew, person=person, source="invite")
    # a recent sync keeps the unknown-sender path out of these tests
    crew.whatsapp_group.last_synced_at = NOW
    crew.whatsapp_group.save()


_counter = {"n": 0}


def ping(body="/viaje ping") -> InboundMessage:
    _counter["n"] += 1
    return InboundMessage.objects.create(
        device_id="dev",
        gowa_message_id=f"T{_counter['n']}",
        event="message",
        chat_id=CHAT,
        sender_jid="5491100000001@s.whatsapp.net",
        body=body,
        raw={},
    )


def process(row: InboundMessage) -> InboundMessage:
    wiring.run_process_inbound(row.pk)
    row.refresh_from_db()
    return row


def replies() -> int:
    return OutboundMessage.objects.filter(kind="reply", to_jid=CHAT).count()


@pytest.mark.django_db
def test_second_command_within_three_seconds_is_throttled(gowa):
    with time_machine.travel(NOW, tick=False):
        first = process(ping())
    with time_machine.travel(NOW + timedelta(seconds=1), tick=False):
        second = process(ping())
    assert first.outcome["reply"] == "sent"
    assert second.status == "done" and second.outcome["reply"] == "throttled"
    assert second.outcome["throttled"] is True
    assert replies() == 1 and gowa.send.call_count == 1


@pytest.mark.django_db
def test_replies_resume_after_the_gap(gowa):
    with time_machine.travel(NOW, tick=False):
        process(ping())
    with time_machine.travel(NOW + timedelta(seconds=4), tick=False):
        again = process(ping())
    assert again.outcome["reply"] == "sent" and replies() == 2


@pytest.mark.django_db
def test_twenty_replies_in_ten_minutes_throttle_the_chat(gowa):
    for i in range(20):
        row = OutboundMessage.objects.create(to_jid=CHAT, kind="reply", body="x")
        OutboundMessage.objects.filter(pk=row.pk).update(
            created_at=NOW - timedelta(seconds=10 + i * 25)
        )
    with time_machine.travel(NOW, tick=False):
        limited = process(ping())
    assert limited.outcome["reply"] == "throttled" and gowa.send.call_count == 0
    with time_machine.travel(NOW + timedelta(minutes=11), tick=False):
        later = process(ping())
    assert later.outcome["reply"] == "sent"


@pytest.mark.django_db
def test_other_chats_and_kinds_do_not_count(gowa):
    OutboundMessage.objects.create(to_jid="120363999999999999@g.us", kind="reply", body="x")
    OutboundMessage.objects.create(to_jid=CHAT, kind="reminder", body="x")
    with time_machine.travel(NOW + timedelta(seconds=1), tick=False):
        row = process(ping())
    assert row.outcome["reply"] == "sent"
    assert json.loads(gowa.send.calls.last.request.content)["message"] == "pong"
