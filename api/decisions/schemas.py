import datetime as dt
from decimal import Decimal
from typing import Literal
from uuid import UUID

from ninja import Field, Schema
from pydantic import AwareDatetime, field_validator, model_validator

Answer = Literal["yes", "maybe", "no"]
DecisionKind = Literal["dates"]
DecisionStatus = Literal["open", "closed"]
Rsvp = Literal["in", "maybe", "out", "pending"]


def _two_decimals(value: Decimal | None) -> Decimal | None:
    """Reject, never round, a weight with more than two decimals."""
    if value is not None and (not value.is_finite() or value != value.quantize(Decimal("0.01"))):
        raise ValueError("maybe_weight takes at most two decimals")
    return value


class DecisionCreateIn(Schema):
    kind: DecisionKind
    window_start: dt.date
    window_end: dt.date
    min_days: int
    max_days: int | None = None
    maybe_weight: Decimal | None = None
    deadline: AwareDatetime | None = None

    _weight = field_validator("maybe_weight")(_two_decimals)


class DecisionPatchIn(Schema):
    """Every field optional; only the ones sent change (``null`` clears the deadline)."""

    window_start: dt.date | None = None
    window_end: dt.date | None = None
    min_days: int | None = None
    max_days: int | None = None
    maybe_weight: Decimal | None = None
    deadline: AwareDatetime | None = None

    _weight = field_validator("maybe_weight")(_two_decimals)

    @model_validator(mode="before")
    @classmethod
    def _kind_is_immutable(cls, data):
        raw = getattr(data, "_obj", data)  # ninja wraps the payload in a getter
        if isinstance(raw, dict) and "kind" in raw:
            raise ValueError("kind cannot be changed")
        return data


class CloseDecisionIn(Schema):
    start_on: dt.date | None = None
    end_on: dt.date | None = None


class AvailabilityAnswerIn(Schema):
    date: dt.date
    answer: Answer | None  # ``null`` clears the day


class AvailabilityIn(Schema):
    answers: list[AvailabilityAnswerIn] = Field(min_length=1, max_length=366)


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
