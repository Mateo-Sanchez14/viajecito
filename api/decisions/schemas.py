import datetime as dt
from decimal import Decimal
from typing import Literal
from uuid import UUID

from ninja import Field, Schema
from pydantic import AwareDatetime

Answer = Literal["yes", "maybe", "no"]
DecisionKind = Literal["dates"]
DecisionStatus = Literal["open", "closed"]
Rsvp = Literal["in", "maybe", "out", "pending"]


class DecisionCreateIn(Schema):
    kind: DecisionKind
    window_start: dt.date
    window_end: dt.date
    min_days: int
    max_days: int | None = None
    maybe_weight: Decimal | None = None
    deadline: AwareDatetime | None = None


class DecisionPatchIn(Schema):
    """Every field optional; only the ones sent change (``null`` clears the deadline)."""

    window_start: dt.date | None = None
    window_end: dt.date | None = None
    min_days: int | None = None
    max_days: int | None = None
    maybe_weight: Decimal | None = None
    deadline: AwareDatetime | None = None


class DecisionCloseIn(Schema):
    start_on: dt.date | None = None
    end_on: dt.date | None = None


class AnswerIn(Schema):
    date: dt.date
    answer: Answer | None  # ``null`` clears the day


class AvailabilityIn(Schema):
    answers: list[AnswerIn] = Field(min_length=1, max_length=366)


class PersonRefOut(Schema):
    person_id: UUID
    display_name: str


class DecisionOut(Schema):
    id: UUID
    trip_id: UUID
    kind: DecisionKind
    status: DecisionStatus
    window_start: dt.date
    window_end: dt.date
    min_days: int
    max_days: int
    maybe_weight: str
    deadline: dt.datetime | None
    outcome_start: dt.date | None
    outcome_end: dt.date | None
    opened_by: PersonRefOut
    closed_by: PersonRefOut | None
    closed_at: dt.datetime | None
    respondents: int
    eligible: int


class WindowOut(Schema):
    start: dt.date
    end: dt.date
    days: int
    avg_score: float
    no_count: int
    blocked_people: list[UUID]
    full_people: list[UUID]
    weekend_days: int
    missing_people: list[UUID]


class GridPersonOut(Schema):
    person_id: UUID
    display_name: str
    rsvp: Rsvp | None
    answers: dict[str, Answer]  # ISO date -> answer


class AvailabilityOut(Schema):
    decision: DecisionOut
    dates: list[dt.date]
    people: list[GridPersonOut]
    me: UUID
    best_windows: list[WindowOut]
    has_data: bool
    non_responders: list[PersonRefOut]
