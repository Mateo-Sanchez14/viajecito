"""HTTP schemas share the single PersonRefOut and preserve output enum choices."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from ninja import Field, Schema

from shared.schemas import PersonRefOut

Kind = Literal["activity", "transport", "lodging", "meal", "meeting", "ski", "other"]
Source = Literal["manual", "proposal"]
Mode = Literal["undated", "before", "during", "after"]


class EntryIn(Schema):
    title: str = Field(min_length=1, max_length=200)
    kind: Kind = "activity"
    day_date: date | None = None
    start_time: str | None = None
    end_time: str | None = None
    location_label: str = Field("", max_length=200)
    lat: float | None = Field(None, ge=-90, le=90, allow_inf_nan=False)
    lng: float | None = Field(None, ge=-180, le=180, allow_inf_nan=False)
    is_meeting_point: bool = False
    notes: str = Field("", max_length=1000)


class EntryPatchIn(Schema):
    title: str | None = Field(None, min_length=1, max_length=200)
    kind: Kind | None = None
    day_date: date | None = None
    start_time: str | None = None
    end_time: str | None = None
    location_label: str | None = Field(None, max_length=200)
    lat: float | None = Field(None, ge=-90, le=90, allow_inf_nan=False)
    lng: float | None = Field(None, ge=-180, le=180, allow_inf_nan=False)
    is_meeting_point: bool | None = None
    notes: str | None = Field(None, max_length=1000)


class DayIn(Schema):
    title: str = Field("", max_length=120)
    notes: str = Field("", max_length=2000)


class MoveIn(Schema):
    direction: Literal["up", "down"]


class NoteIn(Schema):
    body: str = Field(min_length=1, max_length=1000)
    pinned: bool = False


class NotePatchIn(Schema):
    body: str | None = Field(None, min_length=1, max_length=1000)
    pinned: bool | None = None


class EntryOut(Schema):
    id: UUID
    trip_id: UUID
    day_date: date | None
    starts_at: datetime | None
    ends_at: datetime | None
    start_time: str | None
    end_time: str | None
    kind: Kind
    title: str
    location_label: str
    lat: float | None
    lng: float | None
    is_meeting_point: bool
    proposal_id: UUID | None
    source: Source
    position: int
    notes: str


class DayOut(Schema):
    date: date | None
    title: str
    notes: str
    is_virtual: bool
    entries: list[EntryOut]


class ItineraryOut(Schema):
    timezone: str
    start_on: date | None
    end_on: date | None
    days: list[DayOut]
    tray: list[EntryOut]
    out_of_range: list[EntryOut]


class NoteOut(Schema):
    id: UUID
    author: PersonRefOut
    body: str
    pinned: bool
    created_at: datetime
    can_delete: bool


class TodayOut(Schema):
    mode: Mode
    local_date: date
    local_time: str
    timezone: str
    countdown_days: int | None
    day: DayOut | None
    now_entry: EntryOut | None
    next_entry: EntryOut | None
    next_meeting_point: EntryOut | None
    pinned_notes: list[NoteOut]
    recent_notes: list[NoteOut]
    generated_at: datetime
