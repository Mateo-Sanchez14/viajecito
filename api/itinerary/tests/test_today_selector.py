from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest

from itinerary.domain import EntryData, compose_times, order_entries
from itinerary.domain.today import build_today


def trip(tz="America/Argentina/Buenos_Aires", start=date(2026, 10, 1), end=date(2026, 10, 3)):
    return SimpleNamespace(timezone=tz, start_on=start, end_on=end)


def entry(**kw):
    values = dict(
        id="one",
        trip_id="trip",
        day_date=date(2026, 10, 1),
        starts_at=None,
        ends_at=None,
        kind="activity",
        title="Walk",
        location_label="",
        lat=None,
        lng=None,
        is_meeting_point=False,
        proposal_id=None,
        source="manual",
        position=0,
        notes="",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    return EntryData(**(values | kw))


@pytest.mark.parametrize(
    "tz,instants,dates",
    [
        (
            "America/Argentina/Buenos_Aires",
            ("2026-10-02T02:59:00+00:00", "2026-10-02T03:01:00+00:00"),
            (date(2026, 10, 1), date(2026, 10, 2)),
        ),
        (
            "America/Santiago",
            ("2026-07-02T03:59:00+00:00", "2026-07-02T04:01:00+00:00"),
            (date(2026, 7, 1), date(2026, 7, 2)),
        ),
        (
            "America/Santiago",
            ("2026-10-02T02:59:00+00:00", "2026-10-02T03:01:00+00:00"),
            (date(2026, 10, 1), date(2026, 10, 2)),
        ),
        (
            "America/Santiago",
            ("2026-09-06T03:59:00+00:00", "2026-09-06T04:01:00+00:00"),
            (date(2026, 9, 5), date(2026, 9, 6)),
        ),
    ],
)
def test_midnight_uses_trip_timezone(tz, instants, dates):
    for instant, expected in zip(instants, dates, strict=True):
        snap = build_today(
            trip(tz, dates[0], dates[1]), [], [], [], datetime.fromisoformat(instant)
        )
        assert snap.local_date == expected
        assert snap.mode == "during"
        assert snap.day.date == expected


@pytest.mark.parametrize(
    "start,end,day,mode,count",
    [
        (None, None, date(2026, 10, 1), "undated", None),
        (date(2026, 10, 2), date(2026, 10, 4), date(2026, 10, 1), "before", 1),
        (date(2026, 9, 1), date(2026, 9, 4), date(2026, 10, 1), "after", None),
    ],
)
def test_modes(start, end, day, mode, count):
    snap = build_today(
        trip(start=start, end=end), [], [], [], datetime(2026, 10, 1, 15, tzinfo=UTC)
    )
    assert (snap.mode, snap.countdown_days) == (mode, count)
    assert snap.entries == []
    if mode == "before":
        assert snap.day.date == start
    else:
        assert snap.day is None


def test_now_next_and_meeting_fallback():
    now = datetime(2026, 10, 1, 15, tzinfo=UTC)
    old = entry(id="old", starts_at=now - timedelta(hours=3), is_meeting_point=True)
    active = entry(id="active", starts_at=now - timedelta(hours=1))
    nxt = entry(id="next", starts_at=now + timedelta(hours=1), is_meeting_point=True)
    snap = build_today(trip(), [nxt, old, active], [], [], now)
    assert snap.now_entry.id == "active"
    assert snap.next_entry.id == "next"
    assert snap.next_meeting_point.id == "next"
    assert build_today(trip(), [old], [], [], now).next_meeting_point.id == "old"


def test_order_timed_before_untimed_and_tray_by_position():
    now = datetime(2026, 10, 1, 15, tzinfo=UTC)
    entries = [
        entry(id="untimed", position=0),
        entry(id="late", starts_at=now),
        entry(id="early", starts_at=now - timedelta(hours=1)),
    ]
    assert [e.id for e in order_entries(entries)] == ["early", "late", "untimed"]
    assert [
        e.id
        for e in order_entries(
            [entry(id="b", day_date=None, position=2), entry(id="a", day_date=None)]
        )
    ] == ["a", "b"]


def test_local_time_composition_and_invalid_gap():
    start, end = compose_times(date(2026, 10, 1), "09:00", "10:00", "America/Santiago")
    assert start == datetime(2026, 10, 1, 12, tzinfo=UTC)
    assert end == datetime(2026, 10, 1, 13, tzinfo=UTC)
    with pytest.raises(ValueError):
        compose_times(None, "09:00", None, "America/Santiago")
    with pytest.raises(ValueError):
        compose_times(date(2026, 10, 1), "10:00", "09:00", "America/Santiago")
    with pytest.raises(ValueError):
        compose_times(date(2026, 9, 6), "00:30", None, "America/Santiago")


@pytest.mark.parametrize(
    "elapsed,ends,expected",
    [
        (0, None, True),
        (119, None, True),
        (120, None, False),
        (121, None, False),
        (59, 60, True),
        (60, 60, False),
        (61, 60, False),
    ],
)
def test_now_interval_is_half_open_and_no_end_lasts_two_hours(elapsed, ends, expected):
    start = datetime(2026, 10, 1, 12, tzinfo=UTC)
    e = entry(starts_at=start, ends_at=start + timedelta(minutes=ends) if ends else None)
    snap = build_today(trip(), [e], [], [], start + timedelta(minutes=elapsed))
    assert (snap.now_entry is not None) == expected


def test_first_day_preview_and_later_meeting_point():
    now = datetime(2026, 9, 30, 12, tzinfo=UTC)
    e = entry(
        day_date=date(2026, 10, 1),
        starts_at=datetime(2026, 10, 1, 12, tzinfo=UTC),
        is_meeting_point=True,
    )
    snap = build_today(trip(), [e], [], [], now)
    assert snap.mode == "before"
    assert snap.day.date == date(2026, 10, 1)
    assert snap.day.is_virtual
    assert snap.entries == [e]
    assert snap.next_entry == e
    assert snap.next_meeting_point == e


def test_midnight_switch_drops_previous_day_plan():
    e = entry(starts_at=datetime(2026, 10, 2, 2, tzinfo=UTC))
    before = build_today(trip(), [e], [], [], datetime(2026, 10, 2, 2, 59, tzinfo=UTC))
    after = build_today(trip(), [e], [], [], datetime(2026, 10, 2, 3, 1, tzinfo=UTC))
    assert before.now_entry == e
    assert after.entries == []
    assert after.now_entry is None


def test_chile_fall_back_local_time_chooses_first_occurrence():
    start, _ = compose_times(date(2026, 4, 4), "23:30", None, "America/Santiago")
    assert start == datetime(2026, 4, 5, 2, 30, tzinfo=UTC)
    for instant in (
        datetime(2026, 4, 5, 2, 59, tzinfo=UTC),
        datetime(2026, 4, 5, 3, 1, tzinfo=UTC),
    ):
        snap = build_today(
            trip("America/Santiago", date(2026, 4, 4), date(2026, 4, 6)), [], [], [], instant
        )
        assert snap.local_date == date(2026, 4, 4)


def test_pinned_notes_separate_from_five_recent():
    from itinerary.domain import NoteData

    start = datetime(2026, 10, 1, 12, tzinfo=UTC)
    notes = [
        NoteData(str(i), "trip", "person", f"Note {i}", i == 0, start + timedelta(minutes=i))
        for i in range(8)
    ]
    snap = build_today(trip(), [], [], notes, start)
    assert [n.id for n in snap.pinned_notes] == ["0"]
    assert [n.id for n in snap.recent_notes] == ["7", "6", "5", "4", "3"]
