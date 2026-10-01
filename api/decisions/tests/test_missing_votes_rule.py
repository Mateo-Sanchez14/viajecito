import json
from datetime import UTC, date, datetime, timedelta
from io import StringIO

import httpx
import pytest
import respx
import time_machine
from django.core.management import call_command

from crews.models import WhatsAppGroupLink
from decisions.bot import register
from decisions.bot.missing_votes import missing_votes_rule
from decisions.copy import es_ar
from decisions.models import AvailabilityResponse, Decision
from decisions.tests.conftest import rsvp
from messaging import reminders
from messaging.models import OutboundMessage
from messaging.reminders import ReminderContext
from trips.models import Trip

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 7, 1, 15, 0, tzinfo=UTC)  # 12:00 in Buenos Aires
BASE = "http://gowa.test"


def drafts(now=NOW):
    return list(missing_votes_rule(ReminderContext(now=now)))


def open_decision(trip, person, deadline=None, age_days=0, **overrides):
    decision = Decision.objects.create(
        trip=trip,
        window_start=date(2026, 8, 1),
        window_end=date(2026, 8, 31),
        min_days=3,
        max_days=3,
        opened_by=person,
        deadline=deadline,
        **overrides,
    )
    Decision.objects.filter(pk=decision.pk).update(created_at=NOW - timedelta(days=age_days))
    return decision


def vote(trip, person, day=10):
    AvailabilityResponse.objects.create(
        trip=trip, person=person, date=date(2026, 8, day), answer="yes"
    )


def test_registered_under_its_key_after_the_bot_registration():
    register()
    assert [r.key for r in reminders.registered_rules()] == ["decisions.missing_votes"]


def test_within_48h_of_the_deadline_one_draft_lists_the_non_responders(
    crew, ana, beto, cleo, trip, settings
):
    settings.PUBLIC_ORIGIN = "https://viajecito.example.com"
    decision = open_decision(trip, ana, deadline=NOW + timedelta(hours=30))  # Thu 2 Jul 18:00 BA
    vote(trip, ana)
    (draft,) = drafts()
    assert draft.crew_id == str(crew.pk) and draft.trip_id == str(trip.pk)
    assert draft.dedupe_key == f"decisions:missing:{decision.pk}:2026-07-01"
    assert draft.timezone == "America/Argentina/Buenos_Aires"
    assert draft.url_path == f"/crews/{crew.pk}/trips/{trip.pk}/dates"
    assert (draft.subject_type, draft.subject_id) == ("decision", str(decision.pk))
    assert set(draft.mention_person_ids) == {str(beto.pk), str(cleo.pk)}
    assert f"{{@{beto.pk}}}" in draft.body and f"{{@{cleo.pk}}}" in draft.body
    assert f"{{@{ana.pk}}}" not in draft.body
    assert draft.body == es_ar.MISSING_VOTES.format(
        mentions=" ".join(f"{{@{pid}}}" for pid in draft.mention_person_ids),
        when="el jue 2/7 a las 18:00",
        url=f"https://viajecito.example.com{draft.url_path}",
    )
    assert draft.title == es_ar.MISSING_VOTES_TITLE and draft.respect_quiet_hours is True


def test_the_key_changes_every_local_day(trip, ana, beto):
    decision = open_decision(trip, ana, deadline=NOW + timedelta(hours=40))
    next_day = NOW + timedelta(days=1)
    assert drafts(NOW)[0].dedupe_key.endswith(":2026-07-01")
    assert drafts(next_day)[0].dedupe_key == f"decisions:missing:{decision.pk}:2026-07-02"


def test_the_date_in_the_key_is_the_trip_local_date_not_utc(trip, ana, beto):
    open_decision(trip, ana, deadline=NOW + timedelta(hours=30))
    late_utc = datetime(2026, 7, 2, 1, 30, tzinfo=UTC)  # still Jul 1, 22:30 in Buenos Aires
    assert drafts(late_utc)[0].dedupe_key.endswith(":2026-07-01")


def test_a_deadline_more_than_48h_away_does_not_nudge_yet(trip, ana, beto):
    open_decision(trip, ana, deadline=NOW + timedelta(hours=49))
    assert drafts() == []


def test_a_deadline_exactly_48h_away_nudges(trip, ana, beto):
    open_decision(trip, ana, deadline=NOW + timedelta(hours=48))
    assert len(drafts()) == 1


def test_nothing_after_the_deadline(trip, ana, beto):
    open_decision(trip, ana, deadline=NOW - timedelta(minutes=1))
    assert drafts() == []
    Decision.objects.all().delete()
    open_decision(trip, ana, deadline=NOW)
    assert drafts() == []  # the deadline instant itself is no longer "within the next 48 h"


def test_nothing_when_everyone_answered(trip, ana, beto):
    open_decision(trip, ana, deadline=NOW + timedelta(hours=10))
    vote(trip, ana)
    vote(trip, beto)
    assert drafts() == []


def test_out_participants_and_strangers_are_never_mentioned(trip, ana, beto, cleo, stranger):
    rsvp(trip, cleo, "out")
    open_decision(trip, ana, deadline=NOW + timedelta(hours=10))
    (draft,) = drafts()
    assert set(draft.mention_person_ids) == {str(ana.pk), str(beto.pk)}
    assert str(stranger.pk) not in draft.body


def test_without_a_deadline_the_day3_variant_fires_once_the_decision_is_3_days_old(
    crew, trip, ana, beto
):
    decision = open_decision(trip, ana, age_days=3)
    (draft,) = drafts()
    assert draft.dedupe_key == f"decisions:missing:{decision.pk}:day3"
    assert draft.body.startswith("⏰ Falta votar fechas:")
    assert "Cerramos" not in draft.body
    assert draft.url_path == f"/crews/{crew.pk}/trips/{trip.pk}/dates"
    # the key is stable, so it goes out once however many ticks (or days) pass
    assert drafts(NOW + timedelta(days=2))[0].dedupe_key == draft.dedupe_key


def test_the_day3_variant_waits_and_needs_a_non_responder(trip, ana, beto):
    open_decision(trip, ana, age_days=2)
    assert drafts() == []
    Decision.objects.all().update(created_at=NOW - timedelta(days=3))
    vote(trip, ana)
    vote(trip, beto)
    assert drafts() == []


def test_a_decision_with_a_far_deadline_never_uses_the_day3_variant(trip, ana, beto):
    open_decision(trip, ana, deadline=NOW + timedelta(days=10), age_days=5)
    assert drafts() == []


def test_closed_decisions_and_inactive_trips_are_ignored(crew, trip, ana, beto):
    open_decision(trip, ana, deadline=NOW + timedelta(hours=5), status="closed")
    assert drafts() == []
    Decision.objects.all().delete()
    open_decision(trip, ana, deadline=NOW + timedelta(hours=5))
    Trip.objects.filter(pk=trip.pk).update(status="done")
    assert drafts() == []


def test_each_trip_with_an_open_decision_gets_its_own_draft(crew, trip, ana, beto):
    second = Trip.objects.create(crew=crew, name="Otoño")
    open_decision(trip, ana, deadline=NOW + timedelta(hours=5))
    open_decision(second, ana, deadline=NOW + timedelta(hours=5))
    assert {d.trip_id for d in drafts()} == {str(trip.pk), str(second.pk)}
    assert len({d.dedupe_key for d in drafts()}) == 2


def test_the_rule_is_a_pure_read(trip, ana, beto):
    open_decision(trip, ana, deadline=NOW + timedelta(hours=5))
    before = (Decision.objects.count(), OutboundMessage.objects.count())
    drafts()
    assert (Decision.objects.count(), OutboundMessage.objects.count()) == before


# --- through the real tick ------------------------------------------------------------------


@pytest.fixture
def gowa():
    with respx.mock(assert_all_called=False) as router:
        router.send = router.post(f"{BASE}/send/message").mock(
            return_value=httpx.Response(
                200, json={"results": {"message_id": "WA-D", "status": "sent"}}
            )
        )
        yield router


def tick() -> dict:
    out = StringIO()
    call_command("tick", stdout=out)
    return json.loads(out.getvalue())


@pytest.fixture
def synced(crew, settings):
    settings.GOWA_BASE_URL = BASE
    WhatsAppGroupLink.objects.filter(crew=crew).update(
        last_synced_at=datetime(2099, 1, 1, tzinfo=UTC)
    )


def test_the_tick_queues_one_reminder_with_rendered_mentions_and_never_repeats_it(
    crew, trip, ana, beto, synced, gowa
):
    register()
    open_decision(trip, ana, deadline=NOW + timedelta(hours=20))
    with time_machine.travel(NOW, tick=False):
        first = tick()
        second = tick()
    assert (first["reminders_queued"], second["reminders_queued"]) == (1, 0)
    row = OutboundMessage.objects.get(kind="reminder")
    assert "@5491155551111" in row.body and "@5491155552222" in row.body
    assert row.dedupe_key.startswith("decisions:missing:")


def test_quiet_hours_hold_the_reminder_until_the_morning_tick(crew, trip, ana, beto, synced, gowa):
    register()
    open_decision(trip, ana, deadline=NOW + timedelta(hours=30))
    evening = datetime(2026, 7, 2, 1, 30, tzinfo=UTC)  # 22:30 in Buenos Aires
    with time_machine.travel(evening, tick=False):
        assert tick()["reminders_quiet"] == 1
    assert not OutboundMessage.objects.filter(kind="reminder").exists()
    morning = datetime(2026, 7, 2, 12, 30, tzinfo=UTC)  # 09:30
    with time_machine.travel(morning, tick=False):
        assert tick()["reminders_queued"] == 1


def test_the_nudge_window_and_day3_threshold_are_settings(trip, ana, beto, settings):
    open_decision(trip, ana, deadline=NOW + timedelta(hours=60))
    assert drafts() == []
    settings.DECISIONS_NUDGE_WINDOW_HOURS = 72
    assert len(drafts()) == 1
    Decision.objects.all().delete()
    open_decision(trip, ana, age_days=1)
    assert drafts() == []
    settings.DECISIONS_NUDGE_AFTER_DAYS = 1
    assert len(drafts()) == 1
