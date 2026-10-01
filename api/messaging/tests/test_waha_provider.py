"""With ``WHATSAPP_PROVIDER=waha`` every outbound path goes through WAHA."""

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
import time_machine
from django.core.management import call_command

from crews.models import Crew, WhatsAppGroupLink
from identity.models import Person, WhatsAppIdentity
from messaging import reminders
from messaging.adapters.crews_gateway import CrewsGateway
from messaging.adapters.provider import build_gateway
from messaging.adapters.replier import GroupReplier
from messaging.models import OutboundMessage
from messaging.waha.client import WahaClient

BASE = "http://waha.test"
CHAT = "120363000000000000@g.us"
BOT = "5491100000009@c.us"
SENT = {"id": "true_120363000000000000@g.us_WAID1", "fromMe": True}


@pytest.fixture(autouse=True)
def waha_settings(settings):
    settings.WHATSAPP_PROVIDER = "waha"
    settings.WAHA_BASE_URL = BASE
    settings.WAHA_API_KEY = "k3y"
    settings.WAHA_SESSION = "default"


@pytest.fixture
def waha():
    with respx.mock(assert_all_called=False) as router:
        router.send = router.post(f"{BASE}/api/sendText").mock(
            return_value=httpx.Response(201, json=SENT)
        )
        yield router


@pytest.fixture
def crew(db):
    crew = Crew.objects.create(name="Los Pibes")
    WhatsAppGroupLink.objects.create(crew=crew, chat_id=CHAT)
    return crew


def sent_bodies(waha) -> list[dict]:
    return [json.loads(call.request.content) for call in waha.send.calls]


def test_factory_picks_the_client_by_provider(settings):
    client = build_gateway()
    assert isinstance(client, WahaClient)
    settings.WHATSAPP_PROVIDER = "gowa"
    assert type(build_gateway()).__name__ == "GowaClient"


@pytest.mark.django_db
def test_group_reply_is_threaded_through_waha(waha):
    status = GroupReplier().reply(chat_id=CHAT, body="pong", reply_to="false_x_MSG", inbound_id=7)
    assert status == "sent"
    assert sent_bodies(waha) == [
        {"session": "default", "chatId": CHAT, "text": "pong", "reply_to": "false_x_MSG"}
    ]


@pytest.mark.django_db
def test_failed_card_retry_uses_waha(waha, crew):
    GroupReplier().send_card(
        chat_id=CHAT, body="c", reply_to="r", subject_type="t", subject_id="1", dedupe_key="card:1"
    )
    OutboundMessage.objects.update(status="failed", attempts=1)
    result = GroupReplier().send_card(
        chat_id=CHAT, body="c", reply_to="r", subject_type="t", subject_id="1", dedupe_key="card:1"
    )
    assert result.status == "sent" and len(sent_bodies(waha)) == 2


@pytest.mark.django_db
def test_tick_dispatches_queued_rows_through_waha(waha, crew):
    now = datetime(2025, 10, 15, 12, 0, tzinfo=UTC)
    row = OutboundMessage.objects.create(to_jid=CHAT, kind="reminder", body="hola")
    OutboundMessage.objects.filter(pk=row.pk).update(created_at=now - timedelta(seconds=120))
    WhatsAppGroupLink.objects.filter(crew=crew).update(last_synced_at=now)
    with time_machine.travel(now, tick=False), reminders.isolated():
        call_command("tick")
    row.refresh_from_db()
    assert (row.status, row.gowa_message_id) == ("sent", "WAID1")
    assert sent_bodies(waha)[0]["chatId"] == CHAT


@pytest.mark.django_db
@respx.mock
def test_roster_sync_resolves_lids_and_skips_the_bot(crew):
    respx.get(f"{BASE}/api/sessions/default").mock(
        return_value=httpx.Response(200, json={"me": {"id": f"{BOT.split('@')[0]}:7@c.us"}})
    )
    respx.get(f"{BASE}/api/default/groups/{CHAT}/participants/v2").mock(
        return_value=httpx.Response(
            200,
            json=[
                {"id": "5491100000001@c.us", "role": "admin"},
                {"id": "251556000000002@lid", "role": "participant"},
                {"id": "251556000000003@lid", "role": "participant"},
                {"id": BOT, "role": "participant"},
            ],
        )
    )
    respx.get(f"{BASE}/api/default/lids/251556000000002@lid").mock(
        return_value=httpx.Response(200, json={"pn": "5491100000002@c.us"})
    )
    respx.get(f"{BASE}/api/default/lids/251556000000003@lid").mock(
        return_value=httpx.Response(200, json={"pn": None})
    )
    result = CrewsGateway().sync_roster(str(crew.pk))
    assert (result.created, result.skipped) == (2, 1)
    assert sorted(Person.objects.values_list("phone", flat=True)) == [
        "+5491100000001",
        "+5491100000002",
    ]
    identity = WhatsAppIdentity.objects.get(person__phone="+5491100000002")
    assert (identity.jid, identity.lid) == (
        "5491100000002@s.whatsapp.net",
        "251556000000002@lid",
    )
