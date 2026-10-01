from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo

from decisions.domain.rules import DecisionData, Participant, TripInfo
from decisions.ports import DecisionStore, TripGateway
from decisions.use_cases.board import build_board


class NudgeKind(StrEnum):
    DEADLINE = "deadline"  # the deadline is within the nudge window: one reminder per local day
    DAY3 = "day3"  # no deadline: one reminder once the decision has been open long enough


@dataclass(frozen=True)
class Nudge:
    decision: DecisionData
    trip: TripInfo
    non_responders: tuple[Participant, ...]
    kind: NudgeKind
    local_date: date  # ``now`` as a date in the trip's timezone


def due_nudges(
    now: datetime,
    store: DecisionStore,
    trips: TripGateway,
    *,
    window_hours: int = 48,
    after_days: int = 3,
) -> list[Nudge]:
    """Open dates decisions of active trips that should nag their non-responders at ``now``.

    With a deadline: when it falls within the next ``window_hours`` (strictly after ``now``).
    Without one: once the decision has been open ``after_days``. Never when everyone answered.
    A pure read; the reminder rule turns each nudge into a draft.
    """
    due: list[Nudge] = []
    for trip in trips.active_trips():
        decision = store.open_dates_for_trip(trip.id)
        if decision is None:
            continue
        if decision.deadline is not None:
            kind = (
                NudgeKind.DEADLINE
                if now < decision.deadline <= now + timedelta(hours=window_hours)
                else None
            )
        else:
            kind = (
                NudgeKind.DAY3 if now - decision.created_at >= timedelta(days=after_days) else None
            )
        if kind is None:
            continue
        board = build_board(decision, store, trips, with_windows=False)
        if not board.non_responders:
            continue
        local_date = now.astimezone(ZoneInfo(trip.timezone)).date()
        due.append(Nudge(decision, trip, board.non_responders, kind, local_date))
    return due
