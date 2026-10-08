from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from ninja import Field, Schema

Rsvp = Literal["in", "maybe", "out", "pending"]
TripStatus = Literal["idea", "planning", "booked", "ongoing", "done"]


class TripCreateIn(Schema):
    name: str = Field(min_length=1, max_length=120)
    type: str = Field("generic", max_length=32)
    start_on: date | None = None
    end_on: date | None = None
    destination_label: str = Field("", max_length=200)
    currency: str = Field("USD", max_length=8)


class TripPatchIn(Schema):
    """Every field optional; only the ones sent are applied (``null`` clears a date)."""

    name: str | None = Field(None, max_length=120)
    type: str | None = Field(None, max_length=32)
    status: TripStatus | None = None
    start_on: date | None = None
    end_on: date | None = None
    destination_label: str | None = Field(None, max_length=200)
    currency: str | None = Field(None, max_length=8)
    fx_rates: dict[str, Decimal] | None = None


class ParticipantIn(Schema):
    rsvp: Rsvp


class ParticipantOut(Schema):
    person_id: UUID
    display_name: str
    rsvp: Rsvp


class MemberPreviewOut(Schema):
    person_id: UUID
    display_name: str


class TripSummaryOut(Schema):
    id: UUID
    name: str
    type: str
    status: TripStatus
    start_on: date | None
    end_on: date | None
    destination_label: str
    has_cover: bool
    cover_version: int
    member_count: int
    members_preview: list[MemberPreviewOut]


class TripOut(Schema):
    id: UUID
    crew_id: UUID
    name: str
    type: str
    status: TripStatus
    start_on: date | None
    end_on: date | None
    destination_label: str
    timezone: str
    currency: str
    fx_rates: dict[str, str]
    has_cover: bool
    cover_version: int
    modules: list[str]
    participants: list[ParticipantOut]
    my_rsvp: Rsvp
