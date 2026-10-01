"""A card sent through WAHA is recognised when a later WAHA webhook quotes it.

The ledger stores the stanza id (the bare WhatsApp message id) on both sides, whatever form
WAHA uses: ``true_<chat>_<stanza>[_<participant>]``, ``false_…`` or the bare stanza id.
"""

import json

import httpx
import pytest
import respx
from django.utils import timezone

from crews.models import CrewMembership
from identity.models import Person, WhatsAppIdentity
from messaging.handlers import commands
from messaging.handlers.types import Handled
from messaging.models import OutboundMessage
from messaging.tests.conftest import CHAT
from messaging.tests.test_waha_webhook import KEY, sign
from messaging.tests.waha_fixtures import load
from messaging.waha.parser import stanza_id

BASE = "http://waha.test"
STANZA = "3EB0CARD0000000001"
SENT_ID = f"true_{CHAT}_{STANZA}_251556000000009@lid"


@pytest.fixture(autouse=True)
def waha_settings(settings):
    settings.WHATSAPP_PROVIDER = "waha"
    settings.WAHA_BASE_URL = BASE
    settings.WAHA_API_KEY = "k"
    settings.WAHA_SESSION = "default"
    settings.WAHA_WEBHOOK_HMAC_KEY = KEY
    settings.MESSAGING_PROCESS_SYNC = True


@pytest.fixture
def waha():
    with respx.mock(assert_all_called=False) as router:
        router.send = router.post(f"{BASE}/api/sendText").mock(
            return_value=httpx.Response(201, json={"id": SENT_ID})
        )
        yield router


@pytest.fixture(autouse=True)
def member(crew):
    person = Person.objects.create_user("+5491100000001")
    WhatsAppIdentity.objects.create(person=person, jid="5491100000001@s.whatsapp.net")
    CrewMembership.objects.create(crew=crew, person=person, source="invite")
    crew.whatsapp_group.last_synced_at = timezone.now()
    crew.whatsapp_group.save()


@pytest.fixture
def quoted():
    record: list = []

    def probe(ctx, args):
        record.append(ctx.quoted_subject)
        if args:
            ctx.send_card(
                "card", subject_type="proposal", subject_id="P1", dedupe_key="card:proposal:P1"
            )
        return Handled("probe")

    with commands.isolated():
        commands.register_subcommand("probe", probe)
        yield record


def deliver(client, n: int, body: str, reply_id: str | None):
    payload = load("group_text.json")
    payload["payload"]["id"] = f"false_{CHAT}_3EB0IN{n:08d}_5491100000001@c.us"
    payload["payload"]["body"] = body
    if reply_id:
        payload["payload"]["replyTo"] = {"id": reply_id}
    raw = json.dumps(payload).encode()
    return client.post(
        "/hooks/waha/",
        data=raw,
        content_type="application/json",
        HTTP_X_WEBHOOK_HMAC=sign(raw),
        HTTP_X_WEBHOOK_HMAC_ALGORITHM="sha512",
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    "reply_id",
    [
        f"false_{CHAT}_{STANZA}_251556000000009@lid",
        f"true_{CHAT}_{STANZA}",
        STANZA,
    ],
)
def test_card_sent_via_waha_is_resolved_when_quoted(client, waha, quoted, reply_id):
    assert deliver(client, 1, "/viaje probe card", None).json() == {"status": "accepted"}
    assert OutboundMessage.objects.get(kind="card").gowa_message_id == STANZA
    deliver(client, 2, "/viaje probe", reply_id)
    assert quoted == [None, ("proposal", "P1")]


@pytest.mark.django_db
def test_an_unrelated_quote_resolves_to_nothing(client, waha, quoted):
    deliver(client, 1, "/viaje probe card", None)
    deliver(client, 2, "/viaje probe", f"false_{CHAT}_3EB0OTHER")
    assert quoted == [None, None]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (f"true_{CHAT}_ABC123", "ABC123"),
        (f"false_{CHAT}_ABC123_251@lid", "ABC123"),
        ("false_5491100000001@c.us_ABC123", "ABC123"),
        ("ABC123", "ABC123"),
        ("  ABC123 ", "ABC123"),
        ("", ""),
    ],
)
def test_stanza_id(raw, expected):
    assert stanza_id(raw) == expected
