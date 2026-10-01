import json

import httpx
import pytest
import respx

from messaging.models import InboundMessage, OutboundMessage
from proposals.bot import quoted_card
from proposals.domain.verbs import parse_verb
from proposals.models import Comment, Proposal, Vote
from proposals.tests.conftest import gowa_fixture
from proposals.tests.handler_context import Recorder, make_ctx
from proposals.tests.test_link_capture_integration import BASE, post

pytestmark = pytest.mark.django_db


@pytest.fixture
def card(make_proposal):
    proposal = make_proposal(title="Cabañas del Sur")
    OutboundMessage.objects.create(
        to_jid="120363000000000000@g.us",
        kind="card",
        body="🏠 *Cabañas del Sur*",
        status="sent",
        gowa_message_id="WA-CARD-1",
        subject_type="proposal",
        subject_id=str(proposal.pk),
    )
    return proposal


@pytest.fixture
def gowa():
    with respx.mock(assert_all_called=False) as router:
        router.send = router.post(f"{BASE}/send/message").mock(
            return_value=httpx.Response(
                200, json={"code": "SUCCESS", "results": {"message_id": "WA-R-1", "status": "ok"}}
            )
        )
        yield router


def bodies(gowa):
    return [json.loads(call.request.content) for call in gowa.send.calls]


# --- through the webhook --------------------------------------------------------------------


def test_quoting_the_card_with_plus_one_records_the_vote(trip, ana, beto, card, gowa):
    post(gowa_fixture("group_quote_plus_one.json"))
    vote = Vote.objects.get()
    assert (vote.person_id, vote.value, vote.proposal_id) == (beto.pk, 1, card.pk)
    assert vote.source_message_id == InboundMessage.objects.get().pk
    card.refresh_from_db()
    assert card.status == "discussing"
    sent = bodies(gowa)
    assert len(sent) == 1
    assert sent[0]["reply_message_id"] == "3EB0QUOTE000001"
    assert sent[0]["message"] == "Anotado: +1 para Cabañas del Sur (1 a favor, 0 en contra)."
    assert InboundMessage.objects.get().outcome["handler"] == "quoted_card"


def test_quoting_the_card_with_elegida_changes_the_status(trip, ana, card, gowa):
    post(gowa_fixture("group_quote_chosen.json"))
    card.refresh_from_db()
    assert card.status == "chosen" and card.chosen_at is not None
    assert bodies(gowa)[0]["message"] == "Listo, Cabañas del Sur quedó como elegida."


def test_quoting_something_that_is_not_a_card_is_ignored(trip, ana, beto, card, gowa):
    OutboundMessage.objects.update(subject_type="inbound_message", subject_id="1")
    post(gowa_fixture("group_quote_plus_one.json"))
    assert Vote.objects.count() == 0
    assert bodies(gowa) == []
    assert InboundMessage.objects.get().outcome == {"reason": "no_handler"}


def test_a_plus_one_without_quoting_is_just_chatter(trip, ana, beto, card, gowa):
    payload = gowa_fixture("group_quote_plus_one.json")
    payload["payload"].pop("replied_to_id")
    post(payload)
    assert Vote.objects.count() == 0 and bodies(gowa) == []


def test_a_quoted_card_with_a_new_link_still_reaches_link_capture(trip, ana, beto, card, gowa):
    payload = gowa_fixture("group_quote_plus_one.json")
    payload["payload"]["body"] = "mejor esta https://nueva.example.com/lugar"
    post(payload)
    assert Proposal.objects.count() == 2
    assert Vote.objects.count() == 0
    assert InboundMessage.objects.get().outcome["handler"] == "link_capture"


# --- the verb table -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("body", "kind", "value"),
    [
        ("+1", "vote", 1),
        ("👍", "vote", 1),
        ("👍🏽", "vote", 1),
        ("👍️", "vote", 1),
        ("Sí", "vote", 1),
        ("si", "vote", 1),
        ("  ME GUSTA ", "vote", 1),
        ("va", "vote", 1),
        ("-1", "vote", -1),
        ("👎", "vote", -1),
        ("No", "vote", -1),
        ("0", "vote", 0),
        ("meh", "vote", 0),
        ("Me da igual", "vote", 0),
        ("elegida", "transition", "chosen"),
        ("Elegido", "transition", "chosen"),
        ("la elegimos", "transition", "chosen"),
        ("reservada", "transition", "booked"),
        ("RESERVADO", "transition", "booked"),
        ("booked", "transition", "booked"),
        ("descartar", "transition", "discarded"),
        ("Descartada", "transition", "discarded"),
        ("descartado", "transition", "discarded"),
        ("reabrir", "reopen", None),
    ],
)
def test_verbs(body, kind, value):
    verb = parse_verb(body)
    assert (verb.kind, verb.value) == (kind, value)


@pytest.mark.parametrize(
    "body",
    [
        "",
        "hola",
        "+2",
        "no sé",
        "si pero caro",
        "elegida?",
        "puede ser",
        "👍 genial",
        "++1",
        "va a estar bueno",
    ],
)
def test_other_chatter_is_not_a_verb(body):
    assert parse_verb(body) is None


def test_comment_prefixes_keep_the_original_casing():
    verb = parse_verb("Comentario: ¿Hay pileta?")
    assert (verb.kind, verb.value) == ("comment", "¿Hay pileta?")
    assert parse_verb("nota:acordarse del seguro").value == "acordarse del seguro"
    assert parse_verb("comentario:   ") is None


# --- handler level: every action ---------------------------------------------------------------


def act(body, person, crew, card, **kwargs):
    recorder = Recorder(**kwargs)
    ctx = make_ctx(body, person, crew, recorder, quoted=("proposal", str(card.pk)))
    return quoted_card.handle(ctx), recorder


def test_votes_replace_each_other_and_the_reply_has_the_tally(trip, ana, beto, crew, card):
    act("+1", ana, crew, card)
    _, recorder = act("-1", ana, crew, card)
    assert Vote.objects.get().value == -1
    assert recorder.replies == ["Anotado: -1 para Cabañas del Sur (0 a favor, 1 en contra)."]
    _, recorder = act("meh", beto, crew, card)
    assert recorder.replies == ["Anotado: meh para Cabañas del Sur (0 a favor, 1 en contra)."]


def test_voting_on_a_discarded_proposal_says_it_is_closed(trip, ana, crew, card):
    Proposal.objects.update(status="discarded")
    handled, recorder = act("+1", ana, crew, card)
    assert Vote.objects.count() == 0
    assert recorder.replies == ["Cabañas del Sur está descartada. Reabrila para volver a votar."]
    assert handled.detail["action"] == "vote_refused"


@pytest.mark.parametrize(
    ("start", "body", "end"),
    [
        ("proposed", "elegida", "chosen"),
        ("discussing", "elegida", "chosen"),
        ("chosen", "reservada", "booked"),
        ("proposed", "descartar", "discarded"),
        ("booked", "descartar", "discarded"),
        ("discarded", "reabrir", "proposed"),
        ("chosen", "reabrir", "discussing"),
        ("booked", "reabrir", "chosen"),
        ("discussing", "reabrir", "proposed"),
    ],
)
def test_status_replies(trip, ana, crew, card, start, body, end):
    Proposal.objects.update(status=start)
    handled, recorder = act(body, ana, crew, card)
    card.refresh_from_db()
    assert card.status == end
    labels = {
        "proposed": "propuesta",
        "discussing": "en discusión",
        "chosen": "elegida",
        "booked": "reservada",
        "discarded": "descartada",
    }
    assert recorder.replies == [f"Listo, Cabañas del Sur quedó como {labels[end]}."]
    assert handled.detail["action"] == "transition"


@pytest.mark.parametrize(
    ("start", "body", "to_label"),
    [("proposed", "reservada", "reservada"), ("discarded", "elegida", "elegida")],
)
def test_invalid_moves_get_an_explanation_and_change_nothing(
    trip, ana, crew, card, start, body, to_label
):
    Proposal.objects.update(status=start)
    handled, recorder = act(body, ana, crew, card)
    card.refresh_from_db()
    assert card.status == start
    labels = {"proposed": "propuesta", "discarded": "descartada"}
    assert recorder.replies == [f"No puedo pasar Cabañas del Sur de {labels[start]} a {to_label}."]
    assert handled.detail["action"] == "transition_refused"


def test_comments_through_the_card(trip, ana, crew, card):
    handled, recorder = act("comentario: ¿tiene pileta?", ana, crew, card)
    assert Comment.objects.get().body == "¿tiene pileta?"
    assert recorder.replies == ["Anotado tu comentario en Cabañas del Sur."]
    card.refresh_from_db()
    assert card.status == "discussing"


def test_unrecognized_text_is_left_for_the_next_handler(trip, ana, crew, card):
    handled, recorder = act("jaja qué lindo", ana, crew, card)
    assert handled is None and recorder.replies == []


def test_only_proposal_cards_of_this_crew_are_acted_on(trip, ana, crew, card, make_proposal):
    recorder = Recorder()
    for quoted in (
        ("reminder", str(card.pk)),
        ("proposal", "not-a-uuid"),
        ("proposal", "00000000-0000-0000-0000-000000000000"),
    ):
        ctx = make_ctx("+1", ana, crew, recorder, quoted=quoted)
        assert quoted_card.handle(ctx) is None
    from crews.models import Crew
    from trips.models import Trip

    other = Crew.objects.create(name="Otros")
    alien = Proposal.objects.create(
        trip=Trip.objects.create(crew=other, name="X"), author=ana, title="ajena"
    )
    assert (
        quoted_card.handle(make_ctx("+1", ana, crew, recorder, quoted=("proposal", str(alien.pk))))
        is None
    )
    assert Vote.objects.count() == 0
    no_quote = make_ctx("+1", ana, crew, recorder)
    assert quoted_card.handle(no_quote) is None


def test_a_throttled_chat_records_the_action_but_does_not_reply(trip, ana, crew, card):
    handled, recorder = act("+1", ana, crew, card, allowed=False)
    assert Vote.objects.count() == 1
    assert recorder.replies == []
    assert handled.detail["reply"] == "throttled"
