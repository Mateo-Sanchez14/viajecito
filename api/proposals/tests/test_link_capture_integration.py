"""Signed webhook in, proposal and card out (fake fetcher; respx on Gowa)."""

import hashlib
import hmac
import json

import httpx
import pytest
import respx
from django.test import Client

from linkpreview.domain.preview import PreviewData
from messaging.adapters import wiring
from messaging.models import InboundMessage, OutboundMessage
from proposals.models import Proposal
from proposals.tests.conftest import CHAT, gowa_fixture

pytestmark = pytest.mark.django_db

SECRET = "hook-secret"
BASE = "http://gowa.test"
LINK = "https://www.booking.com/hotel/ar/cabanas-del-sur.html"


@pytest.fixture
def gowa():
    with respx.mock(assert_all_called=False) as router:
        router.send = router.post(f"{BASE}/send/message").mock(
            return_value=httpx.Response(
                200,
                json={"code": "SUCCESS", "results": {"message_id": "WA-CARD-1", "status": "ok"}},
            )
        )
        yield router


def post(payload: dict):
    raw = json.dumps(payload).encode()
    signature = "sha256=" + hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return Client().post(
        "/hooks/gowa/",
        data=raw,
        content_type="application/json",
        HTTP_X_HUB_SIGNATURE_256=signature,
    )


@pytest.fixture(autouse=True)
def booking(fake):
    fake.register(
        LINK,
        PreviewData(
            url=LINK,
            final_url=LINK,
            title="Cabañas del Sur",
            site_name="Booking.com",
            fetch_status="ok",
        ),
    )


def sent_bodies(gowa):
    return [json.loads(call.request.content) for call in gowa.send.calls]


def test_a_link_in_the_group_becomes_a_proposal_and_one_threaded_card(trip, ana, gowa):
    response = post(gowa_fixture("group_link.json"))
    assert (response.status_code, response.json()) == (200, {"status": "accepted"})
    proposal = Proposal.objects.get()
    assert (proposal.title, proposal.category, proposal.status) == (
        "Cabañas del Sur",
        "lodging",
        "proposed",
    )
    assert proposal.author_id == ana.pk
    assert proposal.note == "Miren esta cabaña para el finde"
    # tracking parameters never reach the stored URL
    assert proposal.link_preview.url == LINK
    assert proposal.canonical_url == "https://booking.com/hotel/ar/cabanas-del-sur.html"

    bodies = sent_bodies(gowa)
    assert len(bodies) == 1
    assert bodies[0]["reply_message_id"] == "3EB0LINK000001"
    assert bodies[0]["phone"] == CHAT
    message = bodies[0]["message"]
    assert message.startswith("🏠 *Cabañas del Sur*\nAlojamiento\nBooking.com\n👉 ")
    assert (
        f"https://viajecito.example.com/crews/{trip.crew_id}/trips/{trip.pk}/proposals/{proposal.pk}"
        in message
    )
    assert "aid=123" not in message and "utm_source" not in message

    card = OutboundMessage.objects.get(kind="card")
    assert (card.subject_type, card.subject_id) == ("proposal", str(proposal.pk))
    assert card.dedupe_key == f"card:proposal:{proposal.pk}"
    inbound = InboundMessage.objects.get()
    assert inbound.status == "done"
    assert inbound.outcome == {
        "handler": "link_capture",
        "created": [str(proposal.pk)],
        "existing": [],
        "ignored_urls": 0,
    }
    assert proposal.source_message_id == inbound.pk


def test_replaying_the_same_webhook_creates_no_second_proposal_or_send(trip, ana, gowa):
    payload = gowa_fixture("group_link.json")
    post(payload)
    again = post(payload)
    assert again.json() == {"status": "duplicate"}
    assert Proposal.objects.count() == 1
    assert len(sent_bodies(gowa)) == 1


def test_reprocessing_the_stored_message_is_idempotent_too(trip, ana, gowa):
    post(gowa_fixture("group_link.json"))
    inbound = InboundMessage.objects.get()
    InboundMessage.objects.filter(pk=inbound.pk).update(status="received")
    wiring.run_process_inbound(inbound.pk)
    assert Proposal.objects.count() == 1
    assert OutboundMessage.objects.filter(kind="card").count() == 1
    assert len(sent_bodies(gowa)) == 1
    assert InboundMessage.objects.get().outcome["created"] == [str(Proposal.objects.get().pk)]


def test_the_same_link_from_another_member_adds_a_vote_and_says_so(trip, ana, beto, gowa):
    post(gowa_fixture("group_link.json"))
    again = gowa_fixture("group_link.json")
    again["payload"]["id"] = "3EB0LINK000002"
    again["payload"]["from"] = "5491100000002@s.whatsapp.net"
    again["payload"]["body"] = "https://booking.com/hotel/ar/cabanas-del-sur.html?fbclid=zzz"
    post(again)
    assert Proposal.objects.count() == 1
    assert Proposal.objects.get().votes.get().person_id == beto.pk
    bodies = sent_bodies(gowa)
    assert len(bodies) == 2
    assert bodies[1]["reply_message_id"] == "3EB0LINK000002"
    assert bodies[1]["message"] == "Ya estaba 👀 (la propuso Ana). Te sumé un +1."
    outcome = InboundMessage.objects.get(gowa_message_id="3EB0LINK000002").outcome
    assert outcome["existing"] == [str(Proposal.objects.get().pk)] and outcome["created"] == []


def test_plain_chat_creates_nothing_and_sends_nothing(trip, ana, gowa):
    post(
        gowa_fixture("group_link.json")
        | {"payload": {**gowa_fixture("group_link.json")["payload"], "body": "¿cuándo viajamos?"}}
    )
    assert Proposal.objects.count() == 0
    assert sent_bodies(gowa) == []
    assert InboundMessage.objects.get().outcome == {"reason": "no_handler"}
