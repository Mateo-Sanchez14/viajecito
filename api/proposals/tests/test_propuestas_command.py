import json

import httpx
import pytest
import respx

from messaging.handlers import commands
from messaging.models import InboundMessage
from proposals.models import Proposal, Vote
from proposals.tests.conftest import gowa_fixture
from proposals.tests.handler_context import Recorder, make_ctx
from proposals.tests.test_link_capture_integration import BASE, post

pytestmark = pytest.mark.django_db


def run(person, crew, args=""):
    recorder = Recorder()
    handled = commands.handle(make_ctx(f"/viaje propuestas {args}", person, crew, recorder))
    return handled, recorder


def test_lists_the_top_five_open_proposals_by_score(trip, ana, beto, cris, crew, make_proposal):
    best = make_proposal(title="Cabañas del Sur", status="discussing")
    chosen = make_proposal(title="Vuelo", status="chosen")
    for i in range(5):
        make_proposal(title=f"Otra {i}")
    make_proposal(title="Reservada", status="booked")
    make_proposal(title="Descartada", status="discarded")
    for person in (ana, beto, cris):
        Vote.objects.create(proposal=best, person=person, value=1)
    Vote.objects.create(proposal=chosen, person=ana, value=1)
    Vote.objects.create(proposal=chosen, person=beto, value=-1)
    handled, recorder = run(ana, crew)
    assert handled.detail["command"] == "propuestas"
    [reply] = recorder.replies
    lines = reply.splitlines()
    assert lines[0] == "Las propuestas más votadas:"
    assert lines[1] == "1) Cabañas del Sur · en discusión · +3/-0"
    assert lines[2].startswith("2) Otra ") and lines[2].endswith("· propuesta · +0/-0")
    assert len([ln for ln in lines if ln[:2] in {f"{n})" for n in range(1, 6)}]) == 5
    assert "Reservada" not in reply and "Descartada" not in reply
    assert lines[-1] == (
        f"Todas acá: https://viajecito.example.com/crews/{crew.pk}/trips/{trip.pk}/proposals"
    )


def test_an_empty_trip_says_so(trip, ana, crew):
    _, recorder = run(ana, crew)
    assert recorder.replies[0].startswith("Todavía no hay propuestas abiertas.")


def test_without_a_default_trip_it_asks_to_create_one(ana, crew):
    _, recorder = run(ana, crew)
    assert recorder.replies == [
        (
            "Todavía no hay un viaje activo. Creá uno en https://viajecito.example.com "
            "y volvé a tirar el link."
        )
    ]


def test_the_help_lists_the_subcommand_in_sorted_order():
    text = commands.help_text()
    lines = text.splitlines()
    order = [
        lines.index("/viaje ayuda — esta lista"),
        lines.index("/viaje ping — ver si estoy vivo"),
        lines.index("/viaje propuestas — las más votadas"),
    ]
    assert order == sorted(order)


def test_through_the_webhook_and_accent_insensitively(trip, ana, make_proposal):
    make_proposal(title="Cabañas")
    payload = gowa_fixture("group_link.json")
    payload["payload"]["body"] = "/V PROPUÉSTAS"
    with respx.mock(assert_all_called=False) as router:
        send = router.post(f"{BASE}/send/message").mock(
            return_value=httpx.Response(200, json={"results": {"message_id": "W1", "status": "ok"}})
        )
        post(payload)
    assert "1) Cabañas · propuesta · +0/-0" in json.loads(send.calls[0].request.content)["message"]
    assert InboundMessage.objects.get().outcome["handler"] == "commands"
    assert Proposal.objects.count() == 1  # the command is not a link
