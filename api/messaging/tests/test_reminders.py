import json
import logging
from datetime import UTC, date, datetime, time, timedelta
from io import StringIO

import httpx
import pytest
import respx
import time_machine
from django.core.management import call_command

from crews.models import CrewMembership, WhatsAppGroupLink
from identity.models import Person
from messaging import reminders
from messaging.models import OutboundMessage
from messaging.reminders import ReminderContext, ReminderDraft
from messaging.tests.conftest import CHAT

BASE = "http://gowa.test"
BA = "America/Argentina/Buenos_Aires"
SANTIAGO = "America/Santiago"
JULY_EVENING = datetime(2025, 7, 15, 1, 30, tzinfo=UTC)  # 22:30 Buenos Aires, 21:30 Santiago
JULY_MORNING = datetime(2025, 7, 15, 12, 30, tzinfo=UTC)  # 09:30 Buenos Aires, 08:30 Santiago
JULY_NOON = datetime(2025, 7, 15, 15, 0, tzinfo=UTC)  # 12:00 in both


@pytest.fixture
def registry():
    """Isolated, empty registries."""
    with reminders.isolated():
        yield


def draft(crew, key="1", **overrides) -> ReminderDraft:
    values = {
        "crew_id": str(crew.pk),
        "trip_id": "t1",
        "body": f"hola {key}",
        "dedupe_key": f"k:{key}",
        "timezone": BA,
        "subject_type": "trip",
        "subject_id": "t1",
    }
    return ReminderDraft(**{**values, **overrides})


def tick() -> dict:
    out = StringIO()
    call_command("tick", stdout=out)
    return json.loads(out.getvalue())


@pytest.fixture
def gowa():
    with respx.mock(assert_all_called=False) as router:
        router.send = router.post(f"{BASE}/send/message").mock(
            return_value=httpx.Response(
                200, json={"results": {"message_id": "WA-R", "status": "sent"}}
            )
        )
        yield router


@pytest.fixture
def synced(crew):
    # A synced roster keeps the tick from calling Gowa's roster endpoint.
    WhatsAppGroupLink.objects.filter(crew=crew).update(
        last_synced_at=datetime(2099, 1, 1, tzinfo=UTC)
    )
    return crew


# --- registries -----------------------------------------------------------------------------


def test_draft_and_context_shapes():
    ctx = ReminderContext(now=JULY_NOON)
    assert ctx.now == JULY_NOON
    d = ReminderDraft(crew_id="c", trip_id=None, body="b", dedupe_key="k", timezone=BA)
    assert (d.subject_type, d.subject_id, d.mention_person_ids) == ("", "", ())
    assert (d.title, d.url_path, d.respect_quiet_hours) == ("", "", True)
    with pytest.raises(AttributeError):
        d.body = "x"  # type: ignore[misc]


def test_rules_register_idempotently_and_reject_clashes(registry):
    def rule(ctx):
        return []

    on_queued = lambda d: None  # noqa: E731
    reminders.register_reminder_rule("a", rule, on_queued=on_queued)
    reminders.register_reminder_rule("a", rule, on_queued=on_queued)
    assert [(r.key, r.fn, r.on_queued) for r in reminders.registered_rules()] == [
        ("a", rule, on_queued)
    ]
    with pytest.raises(ValueError):
        reminders.register_reminder_rule("a", lambda ctx: [])


def test_channels_and_tick_jobs_register_idempotently_and_reject_clashes(registry):
    def deliver(d):
        return None

    def job(now):
        return None

    reminders.register_channel("push", deliver)
    reminders.register_channel("push", deliver)
    reminders.register_tick_job("snow", job)
    reminders.register_tick_job("snow", job)
    assert reminders.registered_channels() == [("push", deliver)]
    assert reminders.registered_tick_jobs() == [("snow", job)]
    with pytest.raises(ValueError):
        reminders.register_channel("push", lambda d: None)
    with pytest.raises(ValueError):
        reminders.register_tick_job("snow", lambda now: None)


def test_clear_empties_every_registry(registry):
    reminders.register_reminder_rule("a", lambda ctx: [])
    reminders.register_channel("c", lambda d: None)
    reminders.register_tick_job("j", lambda now: None)
    reminders.register_digest_section("s", lambda trip, day: "x")
    reminders.clear()
    assert reminders.registered_rules() == [] and reminders.registered_channels() == []
    assert (
        reminders.registered_tick_jobs() == []
        and reminders.digest_sections("t", date.today()) == []
    )


def test_digest_sections_are_ordered_drop_nones_and_skip_errors(registry, caplog):
    seen = []

    def section(text):
        def fn(trip_id, local_date):
            seen.append((trip_id, local_date))
            return text

        return fn

    def boom(trip_id, local_date):
        raise RuntimeError("kaput")

    reminders.register_digest_section("late", section("late"), order=50)
    reminders.register_digest_section("default", section("default"))  # order=100
    reminders.register_digest_section("snow", section("snow"), order=20)
    reminders.register_digest_section("broken", boom, order=30)
    reminders.register_digest_section("empty", section(None), order=10)
    reminders.register_digest_section(
        "tie", section("tie"), order=20
    )  # same order: registered later
    day = date(2025, 7, 15)
    with caplog.at_level(logging.ERROR, logger="messaging.reminders"):
        assert reminders.digest_sections("t1", day) == ["snow", "tie", "late", "default"]
    assert "broken" in caplog.text and ("t1", day) in seen


def test_digest_sections_accept_the_same_section_twice(registry):
    def fn(trip_id, local_date):
        return "x"

    reminders.register_digest_section("a", fn, order=1)
    reminders.register_digest_section("a", fn, order=1)
    assert reminders.digest_sections("t", date.today()) == ["x"]
    with pytest.raises(ValueError):
        reminders.register_digest_section("a", lambda t, d: "y")


def test_quiet_constants():
    assert reminders.QUIET_START == time(22, 0) and reminders.QUIET_END == time(9, 0)


@pytest.mark.parametrize(
    ("instant", "zone", "quiet"),
    [
        (JULY_EVENING, BA, True),  # 22:30
        (JULY_EVENING, SANTIAGO, False),  # 21:30
        (JULY_MORNING, BA, False),  # 09:30
        (JULY_MORNING, SANTIAGO, True),  # 08:30
        (JULY_NOON, BA, False),
        (datetime(2025, 7, 15, 12, 0, tzinfo=UTC), BA, False),  # 09:00 sharp is allowed
        (datetime(2025, 7, 15, 1, 0, tzinfo=UTC), BA, True),  # 22:00 sharp is quiet
    ],
)
def test_is_quiet_time_uses_the_given_timezone(instant, zone, quiet):
    assert reminders.is_quiet_time(instant, zone) is quiet


# --- tick: queueing -------------------------------------------------------------------------


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_two_drafts_queue_two_rows_that_go_out_in_the_same_pass_and_reruns_add_none(
    registry, synced, gowa
):
    reminders.register_reminder_rule("fake", lambda ctx: [draft(synced, "1"), draft(synced, "2")])
    first = tick()
    assert (first["reminders_queued"], first["dispatched"]) == (2, 2)
    rows = OutboundMessage.objects.order_by("dedupe_key")
    assert [(r.kind, r.status, r.to_jid, r.subject_type, r.subject_id) for r in rows] == [
        ("reminder", "sent", CHAT, "trip", "t1")
    ] * 2
    assert [r.dedupe_key for r in rows] == ["k:1", "k:2"]  # persisted verbatim
    assert [r.body for r in rows] == ["hola 1", "hola 2"]
    second = tick()
    assert second["reminders_queued"] == 0 and OutboundMessage.objects.count() == 2
    assert gowa.send.call_count == 2


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_the_rule_receives_the_tick_instant(registry, synced, gowa):
    seen = []
    reminders.register_reminder_rule("spy", lambda ctx: seen.append(ctx) or [])
    tick()
    assert seen == [ReminderContext(now=JULY_NOON)]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("instant", "zone", "respect", "queued", "quiet"),
    [
        (JULY_EVENING, BA, True, 0, 1),
        (JULY_EVENING, SANTIAGO, True, 1, 0),
        (JULY_MORNING, BA, True, 1, 0),
        (JULY_MORNING, SANTIAGO, True, 0, 1),
        (JULY_EVENING, BA, False, 1, 0),  # respect_quiet_hours=False bypasses the check
    ],
)
def test_quiet_hours_are_applied_in_the_drafts_timezone(
    registry, synced, gowa, instant, zone, respect, queued, quiet
):
    reminders.register_reminder_rule(
        "fake", lambda ctx: [draft(synced, timezone=zone, respect_quiet_hours=respect)]
    )
    with time_machine.travel(instant, tick=False):
        summary = tick()
    assert (summary["reminders_queued"], summary["reminders_quiet"]) == (queued, quiet)
    assert OutboundMessage.objects.count() == queued


@pytest.mark.django_db
def test_a_quiet_draft_goes_out_when_a_later_tick_is_no_longer_quiet(registry, synced, gowa):
    reminders.register_reminder_rule("fake", lambda ctx: [draft(synced)])
    with time_machine.travel(JULY_EVENING, tick=False):
        assert tick()["reminders_quiet"] == 1
    with time_machine.travel(JULY_NOON, tick=False):
        assert tick()["reminders_queued"] == 1


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_crews_without_a_linked_chat_are_skipped(registry, synced, gowa):
    from crews.models import Crew

    lonely = Crew.objects.create(name="No chat")
    reminders.register_reminder_rule("fake", lambda ctx: [draft(lonely)])
    summary = tick()
    assert (summary["reminders_queued"], summary["errors"]) == (0, 0)


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_a_raising_rule_is_counted_and_does_not_stop_the_others(registry, synced, gowa):
    def boom(ctx):
        raise RuntimeError("kaput")

    def boom_midway(ctx):
        yield draft(synced, "half")
        raise RuntimeError("late kaput")

    reminders.register_reminder_rule("boom", boom)
    reminders.register_reminder_rule("midway", boom_midway)
    reminders.register_reminder_rule("fake", lambda ctx: [draft(synced, "ok")])
    summary = tick()
    assert (summary["errors"], summary["reminders_queued"]) == (2, 1)
    assert list(OutboundMessage.objects.values_list("dedupe_key", flat=True)) == ["k:ok"]


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_the_draft_dedupe_key_is_persisted_verbatim_and_stays_unique(registry, synced, gowa):
    reminders.register_reminder_rule(
        "fake", lambda ctx: [draft(synced, dedupe_key="proposals:majority:P1")]
    )
    assert tick()["reminders_queued"] == 1
    assert OutboundMessage.objects.get().dedupe_key == "proposals:majority:P1"
    assert tick()["reminders_queued"] == 0 and OutboundMessage.objects.count() == 1


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_two_rules_producing_the_same_key_queue_it_once(registry, synced, gowa):
    for key in ("rule_a", "rule_b"):
        reminders.register_reminder_rule(key, lambda ctx: [draft(synced, "once")])
    assert tick()["reminders_queued"] == 1


# --- on_queued and channels -----------------------------------------------------------------


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_on_queued_and_channels_run_once_per_new_row(registry, synced, gowa):
    calls = []
    reminders.register_reminder_rule(
        "fake",
        lambda ctx: [draft(synced, "1"), draft(synced, "2")],
        on_queued=lambda d: calls.append(("queued", d.dedupe_key)),
    )
    reminders.register_channel("push", lambda d: calls.append(("push", d.dedupe_key)))
    reminders.register_channel("mirror", lambda d: calls.append(("mirror", d.dedupe_key)))
    tick()
    assert calls == [
        ("queued", "k:1"),
        ("push", "k:1"),
        ("mirror", "k:1"),
        ("queued", "k:2"),
        ("push", "k:2"),
        ("mirror", "k:2"),
    ]
    calls.clear()
    tick()  # the rows already exist: nothing new, nothing called
    assert calls == []


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_channels_receive_the_original_draft_with_its_tokens(registry, synced, gowa):
    seen = []
    original = draft(
        synced, body="hola {@abc}", mention_person_ids=("abc",), title="T", url_path="/x"
    )
    reminders.register_reminder_rule("fake", lambda ctx: [original])
    reminders.register_channel("push", seen.append)
    tick()
    assert seen == [original]


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_a_failing_channel_never_unqueues_the_message_and_does_not_stop_others(
    registry, synced, gowa
):
    called = []

    def broken(d):
        raise RuntimeError("push down")

    reminders.register_reminder_rule("fake", lambda ctx: [draft(synced)])
    reminders.register_channel("push", broken)
    reminders.register_channel("mirror", called.append)
    summary = tick()
    assert (summary["reminders_queued"], summary["errors"]) == (1, 1)
    assert len(called) == 1 and OutboundMessage.objects.get().status == "sent"


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_a_failing_on_queued_rolls_the_row_back_and_is_retried_next_tick(registry, synced, gowa):
    state = {"fail": True}
    channel_calls = []

    def on_queued(d):
        if state["fail"]:
            raise RuntimeError("could not bump the counter")

    reminders.register_reminder_rule("fake", lambda ctx: [draft(synced)], on_queued=on_queued)
    reminders.register_channel("push", channel_calls.append)
    first = tick()
    assert (first["reminders_queued"], first["errors"]) == (0, 1)
    assert OutboundMessage.objects.count() == 0 and channel_calls == []
    state["fail"] = False
    assert tick()["reminders_queued"] == 1 and len(channel_calls) == 1


# --- mentions -------------------------------------------------------------------------------


@pytest.fixture
def ana(synced):
    person = Person.objects.create_user("+5491155551234", display_name="Ana")
    CrewMembership.objects.create(crew=synced, person=person, source="invite")
    return person


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_mention_tokens_render_as_digits_by_default(registry, ana, gowa):
    nameless = Person.objects.create_user("+5491155559999")
    body = f"Falta {{@{ana.pk}}} y {{@{nameless.pk}}} y {{@00000000-0000-0000-0000-000000000000}}!"
    reminders.register_reminder_rule(
        "fake", lambda ctx: [draft(ana.memberships.get().crew, body=body)]
    )
    tick()
    row = OutboundMessage.objects.get()
    assert row.body == "Falta @5491155551234 y @5491155559999 y !"  # unknown id: empty string
    assert row.mentions == []  # JIDs are only stored and sent with GOWA_MENTIONS_ENABLED
    assert "mentions" not in json.loads(gowa.send.calls.last.request.content)


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_with_mentions_enabled_the_jids_also_reach_gowa(registry, ana, gowa, settings):
    settings.GOWA_MENTIONS_ENABLED = True
    crew = ana.memberships.get().crew
    reminders.register_reminder_rule("fake", lambda ctx: [draft(crew, body=f"Falta {{@{ana.pk}}}")])
    tick()
    row = OutboundMessage.objects.get()
    assert row.body == "Falta @5491155551234"
    assert row.mentions == ["5491155551234@s.whatsapp.net"]
    assert json.loads(gowa.send.calls.last.request.content)["mentions"] == [
        "5491155551234@s.whatsapp.net"
    ]


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_mention_person_ids_are_passed_as_jids_when_enabled(registry, ana, gowa, settings):
    settings.GOWA_MENTIONS_ENABLED = True
    crew = ana.memberships.get().crew
    reminders.register_reminder_rule(
        "fake", lambda ctx: [draft(crew, body="Ojo", mention_person_ids=(str(ana.pk),))]
    )
    tick()
    assert OutboundMessage.objects.get().mentions == ["5491155551234@s.whatsapp.net"]


# --- tick jobs ------------------------------------------------------------------------------


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_tick_jobs_run_in_order_in_isolation_and_are_counted(registry, synced, gowa):
    order = []

    def first(now):
        order.append(("first", now))
        return {"fetched": 3}

    def broken(now):
        raise RuntimeError("kaput")

    def last(now):
        order.append(("last", now))

    reminders.register_tick_job("snow", first)
    reminders.register_tick_job("broken", broken)
    reminders.register_tick_job("links", last)
    summary = tick()
    assert order == [("first", JULY_NOON), ("last", JULY_NOON)]
    assert (summary["jobs_run"], summary["errors"]) == (2, 1)
    assert summary["snow.fetched"] == 3


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_tick_jobs_run_after_the_dispatch(registry, synced, gowa):
    reminders.register_reminder_rule("fake", lambda ctx: [draft(synced)])
    seen = []
    reminders.register_tick_job(
        "probe", lambda now: seen.append(OutboundMessage.objects.get().status)
    )
    tick()
    assert seen == ["sent"]


def test_tick_jobs_are_skipped_once_the_deadline_is_reached():
    from messaging.use_cases.dispatch_queued import DispatchResult
    from messaging.use_cases.run_tick import TickConfig, run_tick
    from shared.clock import FrozenClock

    class Locks:
        def acquire(self, *a):
            return True

        def release(self, *a):
            pass

    class Inbound:
        def sweep_stuck(self, *a):
            return 0, 0

        def received_ids(self, limit):
            return []

    class Queue:
        def sweep_stuck(self, *a):
            return 0

    class Rosters:
        def crews_needing_sync(self, before):
            return []

    clock = FrozenClock(JULY_NOON)
    ran = []

    def slow(now):
        ran.append("slow")
        clock.advance(timedelta(seconds=110))

    summary = run_tick(
        locks=Locks(),
        inbound=Inbound(),
        outbound=Queue(),
        rosters=Rosters(),
        process=lambda i: "done",
        dispatch=lambda deadline: DispatchResult(),
        jobs=[("slow", slow), ("late", lambda now: ran.append("late"))],
        clock=clock,
        config=TickConfig(stuck_minutes=2, roster_sync_hours=24, lock_seconds=120),
        owner="t",
    )
    assert ran == ["slow"] and summary["jobs_run"] == 1


# --- malformed mention tokens ---------------------------------------------------------------


def test_malformed_mention_tokens_are_left_alone_and_unknown_ids_vanish():
    from messaging.ports import PersonRef
    from messaging.use_cases.queue_reminders import render_mentions

    people = {"p1": PersonRef(name="Ana", phone="+5491155551234")}
    body = "a {@} b {@{y}} c {@not-a-uuid} d {@p1} e {y} f {@p1"
    text, jids = render_mentions(body, (), people, mentions_enabled=True)
    assert text == "a {@} b {@{y}} c  d @5491155551234 e {y} f {@p1"
    assert jids == ["5491155551234@s.whatsapp.net"]


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_a_reminder_with_malformed_tokens_still_queues(registry, synced, gowa):
    reminders.register_reminder_rule(
        "fake", lambda ctx: [draft(synced, body="x {@} {@{y}} {@nope} y")]
    )
    summary = tick()
    assert (summary["reminders_queued"], summary["errors"]) == (1, 0)
    assert OutboundMessage.objects.get().body == "x {@} {@{y}}  y"


# --- deadline -------------------------------------------------------------------------------


class _Chats:
    def chat_id_for_crew(self, crew_id):
        return CHAT


class _Nobody:
    def people(self, ids):
        return {}


def _run(clock, deadline, margin=timedelta(seconds=5)):
    from contextlib import nullcontext

    from messaging.adapters.ledger import DjangoOutboundLedger
    from messaging.use_cases.queue_reminders import queue_reminders

    return queue_reminders(
        chats=_Chats(),
        people=_Nobody(),
        ledger=DjangoOutboundLedger(),
        atomic=nullcontext,
        now=clock.now(),
        clock=clock,
        deadline=deadline,
        margin=margin,
    )


@pytest.mark.django_db
def test_no_new_draft_starts_near_the_deadline_and_the_skipped_work_is_counted(registry, synced):
    from shared.clock import FrozenClock

    clock = FrozenClock(JULY_NOON)
    deadline = JULY_NOON + timedelta(seconds=30)

    def slow_channel(d):
        clock.advance(timedelta(seconds=26))  # leaves 4 s: inside the 5 s margin

    reminders.register_reminder_rule(
        "fake", lambda ctx: [draft(synced, "1"), draft(synced, "2"), draft(synced, "3")]
    )
    reminders.register_reminder_rule("later", lambda ctx: [draft(synced, "x")])
    reminders.register_channel("slow", slow_channel)
    result = _run(clock, deadline)
    assert (result.queued, result.deadline_skipped, result.errors) == (1, 3, 0)
    # two drafts of the first rule plus the second rule that never started
    assert list(OutboundMessage.objects.values_list("dedupe_key", flat=True)) == ["k:1"]
    # the next pass (fresh deadline) queues the rest and keeps the row that exists
    clock2 = FrozenClock(JULY_NOON)
    reminders.register_channel("quick", lambda d: None)
    fresh = _run(clock2, JULY_NOON + timedelta(seconds=105))
    assert fresh.deadline_skipped == 0
    assert sorted(OutboundMessage.objects.values_list("dedupe_key", flat=True)) == [
        "k:1",
        "k:2",
        "k:3",
        "k:x",
    ]


@pytest.mark.django_db
def test_channels_are_not_started_past_the_deadline(registry, synced):
    from shared.clock import FrozenClock

    clock = FrozenClock(JULY_NOON)
    called = []

    def first(d):
        called.append("first")
        clock.advance(timedelta(seconds=40))

    reminders.register_reminder_rule("fake", lambda ctx: [draft(synced)])
    reminders.register_channel("first", first)
    reminders.register_channel("second", lambda d: called.append("second"))
    reminders.register_channel("third", lambda d: called.append("third"))
    result = _run(clock, JULY_NOON + timedelta(seconds=30))
    assert called == ["first"]
    assert (result.queued, result.deadline_skipped) == (1, 2)  # the row stays queued


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_the_tick_reports_reminders_deadline_skipped(registry, synced, gowa):
    reminders.register_reminder_rule("fake", lambda ctx: [draft(synced)])
    assert tick()["reminders_deadline_skipped"] == 0


def test_isolated_swaps_every_registry_and_restores_it(registry):
    def keep(ctx):
        return []

    reminders.register_reminder_rule("outer", keep)
    with reminders.isolated():
        assert reminders.registered_rules() == []
        reminders.register_reminder_rule("inner", keep)
        reminders.register_channel("c", lambda d: None)
        reminders.register_tick_job("j", lambda now: None)
        reminders.register_digest_section("s", lambda t, d: "x")
    assert [r.key for r in reminders.registered_rules()] == ["outer"]
    assert reminders.registered_channels() == [] and reminders.registered_tick_jobs() == []
    assert reminders.digest_sections("t", date.today()) == []


def test_isolated_restores_the_registries_when_the_block_raises(registry):
    with pytest.raises(RuntimeError), reminders.isolated():
        raise RuntimeError
    assert reminders.registered_rules() == []
