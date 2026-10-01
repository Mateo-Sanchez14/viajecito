"""Today selection uses only the trip timezone and an injected UTC instant."""

from dataclasses import dataclass
from datetime import timedelta
from zoneinfo import ZoneInfo

from itinerary.domain import DayData, order_entries


@dataclass(frozen=True)
class TodaySnapshot:
    mode: str
    local_date: object
    local_time: str
    timezone: str
    countdown_days: int | None
    day: DayData | None
    entries: list
    now_entry: object
    next_entry: object
    next_meeting_point: object
    pinned_notes: list
    recent_notes: list
    generated_at: object


def build_today(trip, entries, days, notes, now_utc):
    local = now_utc.astimezone(ZoneInfo(trip.timezone))
    day_date, countdown = local.date(), None
    if trip.start_on is None or trip.end_on is None:
        mode = "undated"
    elif day_date < trip.start_on:
        mode, countdown = "before", (trip.start_on - day_date).days
    elif day_date > trip.end_on:
        mode = "after"
    else:
        mode = "during"
    selected = trip.start_on if mode == "before" else day_date
    today_entries = (
        order_entries([e for e in entries if e.day_date == selected])
        if mode in ("before", "during")
        else []
    )
    day = None
    if mode in ("before", "during"):
        row = next((d for d in days if d.date == selected), DayData(selected))
        day = DayData(row.date, row.title, row.notes, row.is_virtual, today_entries)
    current = next(
        (
            e
            for e in today_entries
            if e.starts_at is not None
            and e.starts_at <= now_utc
            and (
                now_utc < e.ends_at
                if e.ends_at is not None
                else now_utc < e.starts_at + timedelta(hours=2)
            )
        ),
        None,
    )
    upcoming = next(
        (e for e in today_entries if e.starts_at is not None and e.starts_at > now_utc), None
    )
    points = sorted(
        (
            e
            for e in entries
            if e.is_meeting_point
            and e.starts_at is not None
            and e.day_date is not None
            and e.day_date >= day_date
        ),
        key=lambda e: e.starts_at,
    )
    meeting = next((e for e in points if e.starts_at >= now_utc), None)
    if meeting is None:
        meeting = next((e for e in reversed(points) if e.day_date == day_date), None)
    if mode in ("after", "undated"):
        meeting = None
    ordered_notes = sorted(notes, key=lambda n: n.created_at, reverse=True)
    return TodaySnapshot(
        mode,
        day_date,
        local.strftime("%H:%M"),
        trip.timezone,
        countdown,
        day,
        today_entries,
        current,
        upcoming,
        meeting,
        [n for n in ordered_notes if n.pinned],
        [n for n in ordered_notes if not n.pinned][:5],
        now_utc,
    )
