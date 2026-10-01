import json
from datetime import UTC, date, datetime
from io import StringIO

import pytest
import time_machine
from django.core.management import call_command

from crews.models import Crew, WhatsAppGroupLink
from messaging import reminders
from messaging.models import OutboundMessage
from messaging.reminders import ReminderContext, ReminderDraft
from messaging.tests.conftest import CHAT
from trips.models import Trip

BA = "America/Argentina/Buenos_Aires"
SANTIAGO = "America/Santiago"
JULY_EVENING = datetime(2025, 7, 15, 1, 30, tzinfo=UTC)  # 22:30 Buenos Aires, 21:30 Santiago
JULY_MORNING = datetime(2025, 7, 15, 12, 30, tzinfo=UTC)  # 09:30 Buenos Aires, 08:30 Santiago
JULY_NOON = datetime(2025, 7, 15, 15, 0, tzinfo=UTC)  # 12:00 in both


@pytest.fixture
def registry(monkeypatch):
    """An isolated, empty rule registry."""
    fresh: dict = {}
    monkeypatch.setattr(reminders, "_REGISTRY", fresh)
    return fresh


def context(**overrides) -> ReminderContext:
    values = {
        "now": JULY_NOON,
        "trip_id": "t1",
        "crew_id": "c1",
        "chat_id": CHAT,
        "trip_timezone": BA,
        "trip_start_on": date(2025, 8, 1),
        "trip_end_on": None,
    }
    return ReminderContext(**{**values, **overrides})


def two_drafts(ctx):
    for n in (1, 2):
        yield ReminderDraft(
            to_jid=ctx.chat_id,
            body=f"hola {n}",
            dedupe_key=f"test:{ctx.trip_id}:{n}",
            subject_type="trip",
            subject_id=ctx.trip_id,
        )


def tick() -> dict:
    out = StringIO()
    call_command("tick", stdout=out)
    return json.loads(out.getvalue())


# --- registry -------------------------------------------------------------------------------


def test_defaults_of_context_and_draft():
    ctx = context()
    assert ctx.quiet_hours == (22, 9)
    draft = ReminderDraft(to_jid="x", body="b", dedupe_key="k", subject_type="trip", subject_id="1")
    assert draft.kind == "reminder"
    with pytest.raises(AttributeError):
        draft.body = "other"  # type: ignore[misc]


def test_register_list_and_clear(registry):
    reminders.register_reminder_rule("a", two_drafts)
    reminders.register_reminder_rule("b", lambda ctx: [])
    assert [key for key, _ in reminders.registered_rules()] == ["a", "b"]
    reminders.clear()
    assert reminders.registered_rules() == []


def test_registering_the_same_rule_twice_is_idempotent_but_a_clash_is_rejected(registry):
    reminders.register_reminder_rule("a", two_drafts)
    reminders.register_reminder_rule("a", two_drafts)
    assert len(reminders.registered_rules()) == 1
    with pytest.raises(ValueError):
        reminders.register_reminder_rule("a", lambda ctx: [])


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
def test_quiet_hours_are_computed_in_the_trip_timezone(instant, zone, quiet):
    assert reminders.in_quiet_hours(instant, zone, (22, 9)) is quiet


def test_quiet_hours_that_do_not_wrap_midnight():
    noon = datetime(2025, 7, 15, 15, 0, tzinfo=UTC)  # 12:00 Buenos Aires
    assert reminders.in_quiet_hours(noon, BA, (12, 14)) is True
    assert reminders.in_quiet_hours(noon, BA, (13, 14)) is False


# --- tick phase -----------------------------------------------------------------------------


@pytest.fixture
def trip(crew):
    # A synced roster keeps the tick from calling Gowa (the network is blocked in tests).
    WhatsAppGroupLink.objects.filter(crew=crew).update(
        last_synced_at=datetime(2099, 1, 1, tzinfo=UTC)
    )
    return Trip.objects.create(crew=crew, name="Bariloche", timezone=BA)


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_a_rule_with_two_drafts_queues_two_rows_and_a_rerun_adds_none(registry, trip):
    reminders.register_reminder_rule("fake", two_drafts)
    first = tick()
    assert (first["reminders_queued"], first["reminder_errors"]) == (2, 0)
    rows = OutboundMessage.objects.order_by("dedupe_key")
    assert [(r.status, r.kind, r.to_jid, r.subject_type) for r in rows] == [
        ("queued", "reminder", CHAT, "trip")
    ] * 2
    assert [r.dedupe_key for r in rows] == [f"test:{trip.pk}:1", f"test:{trip.pk}:2"]
    second = tick()
    assert (second["reminders_queued"], second["reminder_errors"]) == (0, 0)
    assert OutboundMessage.objects.count() == 2


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_the_context_carries_the_trip_and_chat(registry, trip):
    seen = []
    reminders.register_reminder_rule("spy", lambda ctx: seen.append(ctx) or [])
    Trip.objects.filter(pk=trip.pk).update(start_on="2025-08-01", end_on="2025-08-09")
    tick()
    (ctx,) = seen
    assert (ctx.trip_id, ctx.crew_id, ctx.chat_id, ctx.trip_timezone) == (
        str(trip.pk),
        str(trip.crew_id),
        CHAT,
        BA,
    )
    assert (ctx.trip_start_on, ctx.trip_end_on) == (date(2025, 8, 1), date(2025, 8, 9))
    assert ctx.now == JULY_NOON and ctx.quiet_hours == (22, 9)


@pytest.mark.django_db
@pytest.mark.parametrize("status", ["idea", "done"])
@time_machine.travel(JULY_NOON, tick=False)
def test_only_planning_booked_and_ongoing_trips_are_visited(registry, trip, status):
    reminders.register_reminder_rule("fake", two_drafts)
    Trip.objects.filter(pk=trip.pk).update(status=status)
    assert tick()["reminders_queued"] == 0


@pytest.mark.django_db
@pytest.mark.parametrize("status", ["planning", "booked", "ongoing"])
@time_machine.travel(JULY_NOON, tick=False)
def test_active_statuses_are_visited(registry, trip, status):
    reminders.register_reminder_rule("fake", two_drafts)
    Trip.objects.filter(pk=trip.pk).update(status=status)
    assert tick()["reminders_queued"] == 2


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_crews_without_a_linked_chat_are_skipped(registry):
    Trip.objects.create(crew=Crew.objects.create(name="No chat"), name="x")
    reminders.register_reminder_rule("fake", two_drafts)
    assert tick()["reminders_queued"] == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("instant", "zone", "queued"),
    [
        (JULY_EVENING, BA, 0),
        (JULY_EVENING, SANTIAGO, 2),
        (JULY_MORNING, BA, 2),
        (JULY_MORNING, SANTIAGO, 0),
    ],
)
def test_drafts_in_the_trips_quiet_hours_are_skipped(registry, trip, instant, zone, queued):
    Trip.objects.filter(pk=trip.pk).update(timezone=zone)
    reminders.register_reminder_rule("fake", two_drafts)
    with time_machine.travel(instant, tick=False):
        summary = tick()
    assert summary["reminders_queued"] == queued and OutboundMessage.objects.count() == queued


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_a_skipped_quiet_draft_is_queued_by_a_later_tick(registry, trip):
    reminders.register_reminder_rule("fake", two_drafts)
    with time_machine.travel(JULY_EVENING, tick=False):
        assert tick()["reminders_queued"] == 0
    assert tick()["reminders_queued"] == 2


@pytest.mark.django_db
@time_machine.travel(JULY_NOON, tick=False)
def test_a_raising_rule_is_counted_and_does_not_stop_the_others(registry, trip):
    def boom(ctx):
        raise RuntimeError("kaput")

    def boom_midway(ctx):
        yield ReminderDraft(
            to_jid=CHAT, body="half", dedupe_key="half", subject_type="trip", subject_id="1"
        )
        raise RuntimeError("late kaput")

    reminders.register_reminder_rule("boom", boom)
    reminders.register_reminder_rule("midway", boom_midway)
    reminders.register_reminder_rule("fake", two_drafts)
    summary = tick()
    assert summary["reminder_errors"] == 2
    assert summary["reminders_queued"] == 2  # the failing generator queued nothing
    assert not OutboundMessage.objects.filter(dedupe_key="half").exists()
    assert summary["errors"] == 0
