from datetime import UTC, date, datetime

import pytest

from messaging.reminders import ReminderContext
from notifications.adapters import wiring
from notifications.copy.es_ar import COUNTDOWN_BODY, COUNTDOWN_TITLE
from notifications.use_cases.countdown import countdown_drafts
from trips.domain import TripData


def trip(start_on, *, status="planning", tz="America/Argentina/Buenos_Aires", name="Bariloche"):
    return TripData(
        id="t1",
        crew_id="c1",
        name=name,
        type="generic",
        status=status,
        start_on=start_on,
        end_on=None,
        destination_label="",
        timezone=tz,
        currency="USD",
        fx_rates={},
    )


NOON_UTC = datetime(2026, 10, 1, 15, 0, tzinfo=UTC)  # 12:00 in Buenos Aires


@pytest.mark.parametrize("days", [30, 7, 1])
def test_a_draft_is_yielded_exactly_at_t30_t7_and_t1(days):
    start = date(2026, 10, 1 + days) if days < 30 else date(2026, 10, 31)
    (draft,) = countdown_drafts(NOON_UTC, [trip(start)])
    assert draft.dedupe_key == f"notifications:countdown:t1:T-{days}"
    assert draft.body == COUNTDOWN_BODY[days].format(trip="Bariloche")
    assert (draft.title, draft.trip_id, draft.crew_id) == (COUNTDOWN_TITLE, "t1", "c1")
    assert draft.timezone == "America/Argentina/Buenos_Aires"
    assert draft.url_path == "/crews/c1/trips/t1"
    assert draft.respect_quiet_hours is True


@pytest.mark.parametrize("days", [0, 2, 6, 8, 29, 31, -1])
def test_other_distances_yield_nothing(days):
    start = date.fromordinal(date(2026, 10, 1).toordinal() + days)
    assert countdown_drafts(NOON_UTC, [trip(start)]) == []


def test_undated_trips_yield_nothing():
    assert countdown_drafts(NOON_UTC, [trip(None)]) == []


@pytest.mark.parametrize("status", ["idea", "ongoing", "done"])
def test_only_planning_and_booked_trips_count_down(status):
    assert countdown_drafts(NOON_UTC, [trip(date(2026, 10, 8), status=status)]) == []
    assert countdown_drafts(NOON_UTC, [trip(date(2026, 10, 8), status="booked")])


def test_the_day_is_counted_in_the_trip_timezone_across_midnight():
    start = date(2026, 10, 8)
    # 01:30 UTC on Oct 1 is still Sep 30 in Buenos Aires: 8 days to go, not 7.
    early = datetime(2026, 10, 1, 1, 30, tzinfo=UTC)
    assert countdown_drafts(early, [trip(start)]) == []
    # The same instant in Auckland is already Oct 1 14:30: 7 days to go.
    drafts = countdown_drafts(early, [trip(start, tz="Pacific/Auckland")])
    assert [d.dedupe_key for d in drafts] == ["notifications:countdown:t1:T-7"]
    # 03:00 UTC is Oct 1 00:00 in Buenos Aires: now it is 7 there too.
    midnight = datetime(2026, 10, 1, 3, 0, tzinfo=UTC)
    assert len(countdown_drafts(midnight, [trip(start)])) == 1


def test_the_draft_key_is_stable_across_the_whole_local_day():
    start = date(2026, 10, 8)
    morning = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
    evening = datetime(2026, 10, 2, 2, 0, tzinfo=UTC)  # still Oct 1 at 23:00 in Buenos Aires
    assert countdown_drafts(morning, [trip(start)]) == countdown_drafts(evening, [trip(start)])


def test_a_trip_with_a_bad_timezone_is_skipped_not_fatal():
    assert countdown_drafts(NOON_UTC, [trip(date(2026, 10, 8), tz="Nope/Nowhere")]) == []


@pytest.mark.django_db
def test_the_registered_rule_reads_the_active_trips(crew, db):
    from trips.models import Trip

    Trip.objects.create(crew=crew, name="Bariloche", status="planning", start_on=date(2026, 10, 8))
    Trip.objects.create(crew=crew, name="Lejos", status="planning", start_on=date(2027, 1, 1))
    drafts = list(wiring.countdown_rule(ReminderContext(now=NOON_UTC)))
    assert [d.body for d in drafts] == [COUNTDOWN_BODY[7].format(trip="Bariloche")]
