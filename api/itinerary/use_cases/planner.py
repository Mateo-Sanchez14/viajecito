"""Planner operations depend only on the store protocol and pure rules."""

from datetime import timedelta
from zoneinfo import ZoneInfo

from itinerary.domain import DayData, ItineraryError, in_range, order_entries, validate_entry
from itinerary.ports import default_store

ENTRY_DEFAULTS = dict(
    title="",
    kind="activity",
    day_date=None,
    start_time=None,
    end_time=None,
    location_label="",
    lat=None,
    lng=None,
    is_meeting_point=False,
    notes="",
)


def itinerary(trip):
    store = default_store()
    entries, rows = store.entries(str(trip.id)), store.days(str(trip.id))
    dates = []
    if trip.start_on and trip.end_on:
        day = trip.start_on
        while day <= trip.end_on:
            dates.append(day)
            if day == trip.end_on:
                break
            day += timedelta(days=1)
    days = []
    for day in dates:
        row = next((d for d in rows if d.date == day), DayData(day))
        days.append(
            DayData(
                day,
                row.title,
                row.notes,
                row.is_virtual,
                order_entries([e for e in entries if e.day_date == day]),
            )
        )
    return dict(
        timezone=trip.timezone,
        start_on=trip.start_on,
        end_on=trip.end_on,
        days=days,
        tray=order_entries([e for e in entries if e.day_date is None]),
        out_of_range=order_entries(
            [e for e in entries if e.day_date is not None and not in_range(trip, e.day_date)]
        ),
    )


def save_day(trip, day, fields):
    if not in_range(trip, day):
        raise ItineraryError("day_out_of_range")
    return default_store().save_day(str(trip.id), day, fields)


def write_entry(trip, actor_id, fields, existing=None):
    values = ENTRY_DEFAULTS.copy()
    if existing:
        values.update({k: getattr(existing, k) for k in values if hasattr(existing, k)})
        for field, key in (("starts_at", "start_time"), ("ends_at", "end_time")):
            instant = getattr(existing, field)
            values[key] = (
                instant.astimezone(ZoneInfo(trip.timezone)).strftime("%H:%M") if instant else None
            )
    values.update(fields)
    if existing and fields.get("day_date", "absent") is None:
        values["start_time"] = values["end_time"] = None
    starts, ends = validate_entry(trip, values)
    values.pop("start_time")
    values.pop("end_time")
    values.update(starts_at=starts, ends_at=ends)
    return default_store().save_entry(
        str(trip.id), actor_id, values, existing.id if existing else None
    )


def write_note(trip, actor_id, fields, existing=None):
    values = {
        "body": existing.body if existing else "",
        "pinned": existing.pinned if existing else False,
    } | fields
    if not values["body"].strip() or len(values["body"]) > 1000:
        raise ItineraryError("invalid_request")
    return default_store().save_note(
        str(trip.id), actor_id, values, existing.id if existing else None
    )
