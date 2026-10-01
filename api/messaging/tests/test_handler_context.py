"""``HandlerContext.send_card`` and ``quoted_subject`` (R-4), exercised through a subcommand."""

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
import time_machine

from crews.models import CrewMembership
from identity.models import Person, WhatsAppIdentity
from messaging.adapters import wiring
from messaging.handlers import commands
from messaging.handlers.types import Handled, SentCard
from messaging.models import InboundMessage, OutboundMessage

BASE = "http://gowa.test"
CHAT = "120363000000000000@g.us"
NOW = datetime(2025, 10, 15, 12, 0, tzinfo=UTC)

pytestmark = pytest.mark.django_db


@pytest.fixture
def gowa():
    with respx.mock(assert_all_called=False) as router:
        router.send = router.post(f"{BASE}/send/message").mock(
            return_value=httpx.Response(
                200, json={"results": {"message_id": "WA-CARD", "status": "sent"}}
            )
        )
        yield router


@pytest.fixture(autouse=True)
def member(crew):
    person = Person.objects.create_user("+5491100000001")
    WhatsAppIdentity.objects.create(person=person, jid="5491100000001@s.whatsapp.net")
    CrewMembership.objects.create(crew=crew, person=person, source="invite")
    crew.whatsapp_group.last_synced_at = NOW
    crew.whatsapp_group.save()


@pytest.fixture
def seen(monkeypatch):
    """Register a ``probe`` subcommand that records what the context offers."""
    monkeypatch.setattr(commands, "_SUBCOMMANDS", {})
    monkeypatch.setattr(commands, "_ALIASES", {})
    commands.register_core_subcommands()
    record: dict = {"cards": [], "quoted": []}

    def probe(ctx, args):
        record["quoted"].append(ctx.quoted_subject)
        if args:
            record["cards"].append(
                ctx.send_card(
                    "card body",
                    subject_type="proposal",
                    subject_id="P1",
                    dedupe_key=f"card:proposal:{args}",
                )
            )
        return Handled("probe")

    commands.register_subcommand("probe", probe)
    return record


@pytest.fixture
def card_chain(monkeypatch):
    """A chain whose only handler replies (when asked) and then sends a card, bypassing /viaje."""
    record: dict = {"cards": []}

    def handler(ctx):
        if "reply" in ctx.message.body:
            ctx.reply("hi")
        record["cards"].append(
            ctx.send_card("card", subject_type="proposal", subject_id="P1", dedupe_key="card:k")
        )
        return Handled("cards")

    monkeypatch.setattr("messaging.router.handler_chain", lambda: [handler])
    return record


_counter = {"n": 0}


def inbound(body: str, replied_to: str = "") -> int:
    _counter["n"] += 1
    return InboundMessage.objects.create(
        device_id="dev",
        gowa_message_id=f"IN{_counter['n']}",
        event="message",
        chat_id=CHAT,
        sender_jid="5491100000001@s.whatsapp.net",
        body=body,
        replied_to_id=replied_to,
        raw={},
    ).pk


@time_machine.travel(NOW, tick=False)
def test_send_card_records_a_threaded_card_with_its_subject(seen, gowa):
    row_id = inbound("/viaje probe one")
    wiring.run_process_inbound(row_id)
    assert seen["cards"] == [SentCard("sent", "WA-CARD")]
    card = OutboundMessage.objects.get()
    assert (card.kind, card.status, card.to_jid, card.body) == ("card", "sent", CHAT, "card body")
    assert (card.subject_type, card.subject_id) == ("proposal", "P1")
    assert card.dedupe_key == "card:proposal:one" and card.gowa_message_id == "WA-CARD"
    sent = json.loads(gowa.send.calls.last.request.content)
    assert sent["reply_message_id"] == "IN1"  # threaded to the inbound message


@time_machine.travel(NOW, tick=False)
def test_the_same_dedupe_key_is_a_duplicate_with_the_existing_gowa_id(seen, gowa):
    wiring.run_process_inbound(inbound("/viaje probe one"))
    wiring.run_process_inbound(inbound("/viaje probe one"))
    assert seen["cards"] == [SentCard("sent", "WA-CARD"), SentCard("duplicate", "WA-CARD")]
    assert OutboundMessage.objects.count() == 1 and gowa.send.call_count == 1


@time_machine.travel(NOW, tick=False)
def test_a_failed_send_is_reported_and_recorded(seen, gowa):
    gowa.send.mock(return_value=httpx.Response(500))
    wiring.run_process_inbound(inbound("/viaje probe one"))
    assert seen["cards"] == [SentCard("failed", None)]
    assert OutboundMessage.objects.get().status == "failed"


@time_machine.travel(NOW, tick=False)
def test_cards_bypass_the_three_second_reply_gap(card_chain, gowa):
    wiring.run_process_inbound(inbound("reply and card"))  # the reply is 0 s old when the card goes
    assert card_chain["cards"] == [SentCard("sent", "WA-CARD")]
    assert sorted(OutboundMessage.objects.values_list("kind", flat=True)) == ["card", "reply"]


@time_machine.travel(NOW, tick=False)
def test_cards_count_in_the_ten_minute_window(card_chain, gowa):
    for n in range(20):
        OutboundMessage.objects.create(to_jid=CHAT, kind="card", body="x", dedupe_key=f"old{n}")
    wiring.run_process_inbound(inbound("card"))
    assert card_chain["cards"] == [SentCard("failed", None)]
    assert OutboundMessage.objects.count() == 20 and gowa.send.call_count == 0


@time_machine.travel(NOW, tick=False)
def test_cards_older_than_the_window_do_not_count(card_chain, gowa):
    for n in range(20):
        row = OutboundMessage.objects.create(to_jid=CHAT, kind="card", body="x", dedupe_key=f"o{n}")
        OutboundMessage.objects.filter(pk=row.pk).update(created_at=NOW - timedelta(minutes=11))
    wiring.run_process_inbound(inbound("card"))
    assert card_chain["cards"] == [SentCard("sent", "WA-CARD")]


@time_machine.travel(NOW, tick=False)
def test_cards_also_use_up_the_reply_budget(seen, gowa):
    for n in range(20):
        OutboundMessage.objects.create(to_jid=CHAT, kind="card", body="x", dedupe_key=f"c{n}")
    wiring.run_process_inbound(inbound("/viaje ping"))
    assert OutboundMessage.objects.filter(kind="reply").count() == 0  # throttled


@time_machine.travel(NOW, tick=False)
def test_quoted_subject_resolves_one_of_our_messages(seen, gowa):
    OutboundMessage.objects.create(
        to_jid=CHAT,
        kind="card",
        body="x",
        gowa_message_id="WAQ",
        subject_type="proposal",
        subject_id="P9",
        dedupe_key="card:proposal:P9",
    )
    wiring.run_process_inbound(inbound("/viaje probe", replied_to="WAQ"))
    assert seen["quoted"] == [("proposal", "P9")]


@time_machine.travel(NOW, tick=False)
def test_quoted_subject_is_none_for_foreign_other_chat_or_missing_quotes(seen, gowa):
    OutboundMessage.objects.create(
        to_jid="999@g.us",
        kind="card",
        body="x",
        gowa_message_id="WAOTHER",
        subject_type="proposal",
        subject_id="P9",
        dedupe_key="k",
    )
    wiring.run_process_inbound(inbound("/viaje probe", replied_to="WA-NOT-OURS"))
    wiring.run_process_inbound(inbound("/viaje probe", replied_to="WAOTHER"))
    wiring.run_process_inbound(inbound("/viaje probe"))
    assert seen["quoted"] == [None, None, None]


# --- failed cards are retried ---------------------------------------------------------------


def stored_card(status: str, attempts: int, **extra) -> OutboundMessage:
    return OutboundMessage.objects.create(
        to_jid=CHAT,
        kind="card",
        body="card body",
        dedupe_key="card:proposal:one",
        status=status,
        attempts=attempts,
        subject_type="proposal",
        subject_id="P1",
        **extra,
    )


@time_machine.travel(NOW, tick=False)
def test_a_failed_card_is_retried_on_the_same_row(seen, gowa):
    row = stored_card("failed", 1, error="gowa responded with HTTP 500")
    wiring.run_process_inbound(inbound("/viaje probe one"))
    assert seen["cards"] == [SentCard("sent", "WA-CARD")]
    row.refresh_from_db()
    assert (row.status, row.gowa_message_id, row.attempts) == ("sent", "WA-CARD", 2)
    assert OutboundMessage.objects.filter(kind="card").count() == 1
    assert json.loads(gowa.send.calls.last.request.content)["message"] == "card body"


@time_machine.travel(NOW, tick=False)
def test_a_retry_that_fails_again_is_reported_and_counted(seen, gowa):
    gowa.send.mock(return_value=httpx.Response(500))
    row = stored_card("failed", 1)
    wiring.run_process_inbound(inbound("/viaje probe one"))
    assert seen["cards"] == [SentCard("failed", None)]
    row.refresh_from_db()
    assert (row.status, row.attempts) == ("failed", 2)


@time_machine.travel(NOW, tick=False)
def test_a_card_that_used_up_its_attempts_stays_a_duplicate(seen, gowa):
    stored_card("failed", 3)
    wiring.run_process_inbound(inbound("/viaje probe one"))
    assert seen["cards"] == [SentCard("duplicate", None)] and gowa.send.call_count == 0


@pytest.mark.parametrize("status", ["sent", "queued", "sending"])
@time_machine.travel(NOW, tick=False)
def test_sent_queued_and_sending_cards_are_duplicates(seen, gowa, status):
    stored_card(status, 1, gowa_message_id="WA-OLD" if status == "sent" else "")
    wiring.run_process_inbound(inbound("/viaje probe one"))
    expected = SentCard("duplicate", "WA-OLD" if status == "sent" else None)
    assert seen["cards"] == [expected] and gowa.send.call_count == 0
