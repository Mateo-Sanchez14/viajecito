"""Pure rules and value objects of a dates decision (no Django, no HTTP)."""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from decisions.domain.best_window import WindowScore

KIND_DATES = "dates"
STATUS_OPEN = "open"
STATUS_CLOSED = "closed"
STATUSES = (STATUS_OPEN, STATUS_CLOSED)
ANSWERS = ("yes", "maybe", "no")
MAX_TRIP_DAYS = 60
DEFAULT_MAYBE_WEIGHT = Decimal("0.50")
MAX_WINDOW_DAYS = 180  # longest candidate range, in days (inclusive)


class DecisionError(Exception):
    """Base of every rule violation; ``code`` is the API error code."""

    code = "invalid_request"


class InvalidWindowError(DecisionError):
    code = "invalid_window"


class DateOutOfRangeError(DecisionError):
    code = "date_out_of_range"


class NoWindowError(DecisionError):
    code = "no_window"


class DecisionAlreadyOpenError(DecisionError):
    code = "decision_already_open"


class DecisionClosedError(DecisionError):
    code = "decision_closed"


class DecisionOpenError(DecisionError):
    code = "decision_open"


class DecisionNotFoundError(DecisionError):
    code = "not_found"


@dataclass(frozen=True)
class PersonRef:
    person_id: str
    display_name: str


@dataclass(frozen=True)
class Participant:
    person_id: str
    display_name: str
    rsvp: str  # in | maybe | out | pending


@dataclass(frozen=True)
class TripInfo:
    id: str
    crew_id: str
    name: str
    timezone: str
    start_on: date | None
    end_on: date | None


@dataclass(frozen=True)
class DecisionData:
    id: str
    trip_id: str
    kind: str
    status: str
    window_start: date
    window_end: date
    min_days: int
    max_days: int
    maybe_weight: Decimal
    deadline: datetime | None
    outcome_start: date | None
    outcome_end: date | None
    opened_by: str
    closed_by: str | None
    closed_at: datetime | None
    created_at: datetime


@dataclass(frozen=True)
class Board:
    """Everything computed from a decision's answers (not stored)."""

    decision: DecisionData
    eligible: tuple[Participant, ...]  # active members minus ``rsvp = out``
    answers: dict[tuple[str, date], str]  # ``(person_id, date)`` of the window, eligible people
    windows: tuple[WindowScore, ...]
    has_data: bool
    non_responders: tuple[Participant, ...]  # eligible with no answer inside the window

    @property
    def respondents(self) -> int:
        return len(self.eligible) - len(self.non_responders)


def span_days(start: date, end: date) -> int:
    return (end - start).days + 1


def validate_window(
    *,
    window_start: date,
    window_end: date,
    min_days: int,
    max_days: int,
    maybe_weight: Decimal,
    max_window_days: int = MAX_WINDOW_DAYS,
) -> None:
    """Raise ``InvalidWindowError`` unless the range, lengths and maybe weight are acceptable."""
    if window_end < window_start:
        raise InvalidWindowError("window_end must not be before window_start")
    span = span_days(window_start, window_end)
    if span > max_window_days:
        raise InvalidWindowError(f"the range spans {span} days; the maximum is {max_window_days}")
    if not 1 <= min_days <= MAX_TRIP_DAYS:
        raise InvalidWindowError(f"min_days must be between 1 and {MAX_TRIP_DAYS}")
    if not min_days <= max_days <= MAX_TRIP_DAYS:
        raise InvalidWindowError(f"max_days must be between min_days and {MAX_TRIP_DAYS}")
    if min_days > span:
        raise InvalidWindowError("min_days does not fit in the range")
    if not Decimal(0) <= maybe_weight <= Decimal(1):
        raise InvalidWindowError("maybe_weight must be between 0 and 1")


def choose_close_window(
    decision: DecisionData,
    best: tuple[WindowScore, ...],
    start_on: date | None,
    end_on: date | None,
) -> tuple[date, date]:
    """The dates a closing writes: the explicit pair (inside the window) or the best window #1."""
    if start_on is None and end_on is None:
        if not best:
            raise NoWindowError("the decision has no candidate window")
        return best[0].start, best[0].end
    if start_on is None or end_on is None:
        raise InvalidWindowError("send both start_on and end_on, or neither")
    if end_on < start_on:
        raise InvalidWindowError("end_on must not be before start_on")
    if start_on < decision.window_start or end_on > decision.window_end:
        raise InvalidWindowError("the chosen dates must lie inside the decision window")
    return start_on, end_on


def validate_answer_dates(decision: DecisionData, dates: list[date]) -> None:
    for day in dates:
        if not decision.window_start <= day <= decision.window_end:
            raise DateOutOfRangeError(f"{day.isoformat()} is outside the decision window")
