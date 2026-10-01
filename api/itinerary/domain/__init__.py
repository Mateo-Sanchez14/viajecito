"""Pure itinerary records, ordering and local-time validation."""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo


class ItineraryError(ValueError):
    def __init__(self, code, status=400):
        self.code, self.status = code, status
        super().__init__(code)


@dataclass(frozen=True)
class EntryData:
    id: str
    trip_id: str
    day_date: date | None
    starts_at: datetime | None
    ends_at: datetime | None
    kind: str
    title: str
    location_label: str
    lat: float | None
    lng: float | None
    is_meeting_point: bool
    proposal_id: str | None
    source: str
    position: int
    notes: str
    created_at: datetime


@dataclass(frozen=True)
class DayData:
    date: date | None
    title: str = ""
    notes: str = ""
    is_virtual: bool = True
    entries: list[EntryData] = field(default_factory=list)


@dataclass(frozen=True)
class NoteData:
    id: str
    trip_id: str
    author_id: str
    body: str
    pinned: bool
    created_at: datetime


def in_range(trip, day):
    return bool(trip.start_on and trip.end_on and trip.start_on <= day <= trip.end_on)


def order_entries(entries):
    if entries and all(e.day_date is None for e in entries):
        return sorted(entries, key=lambda e: (e.position, e.created_at))
    return sorted(
        entries,
        key=lambda e: (
            e.starts_at is None,
            e.starts_at or datetime.max.replace(tzinfo=UTC),
            e.position,
            e.created_at,
        ),
    )


def compose_times(day, start, end, tz):
    if day is None and (start is not None or end is not None):
        raise ItineraryError("invalid_times")
    if end is not None and start is None:
        raise ItineraryError("invalid_times")

    def instant(value):
        if value is None:
            return None
        try:
            local_time = time.fromisoformat(value)
            if len(value) != 5 or local_time.tzinfo:
                raise ValueError
            local = datetime.combine(day, local_time, ZoneInfo(tz))
            utc = local.astimezone(UTC)
            if utc.astimezone(ZoneInfo(tz)).replace(tzinfo=None) != local.replace(tzinfo=None):
                raise ValueError
            return utc
        except (ValueError, TypeError) as exc:
            raise ItineraryError("invalid_times") from exc

    starts, ends = instant(start), instant(end)
    if ends is not None and starts is not None and ends < starts:
        raise ItineraryError("invalid_times")
    return starts, ends


def validate_entry(trip, fields):
    if not fields["title"].strip() or len(fields["title"]) > 200:
        raise ItineraryError("invalid_request")
    day = fields.get("day_date")
    if day is not None and not in_range(trip, day):
        raise ItineraryError("day_out_of_range")
    return compose_times(day, fields.get("start_time"), fields.get("end_time"), trip.timezone)
