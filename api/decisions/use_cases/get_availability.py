from dataclasses import dataclass
from datetime import date

from decisions.domain import rules
from decisions.domain.best_window import WindowScore
from decisions.domain.rules import PersonRef
from decisions.ports import DecisionStore, TripGateway
from decisions.use_cases.board import (
    DecisionView,
    build_board,
    decision_view,
    participant_ref,
    window_dates,
)


@dataclass(frozen=True)
class GridPerson:
    person_id: str
    display_name: str
    rsvp: str | None
    answers: dict[date, str]


@dataclass(frozen=True)
class AvailabilityView:
    decision: DecisionView
    dates: list[date]
    people: list[GridPerson]
    me: str
    best_windows: tuple[WindowScore, ...]
    has_data: bool
    non_responders: list[PersonRef]


def get_availability(
    decision_id: str, person_id: str, store: DecisionStore, trips: TripGateway
) -> AvailabilityView:
    """The availability grid, the best windows and the non-responders of a decision.

    The grid lists the eligible people; the caller is always included (their own row stays
    editable even when they answered ``out``) but only eligible people count in the ranking.
    """
    decision = store.get(decision_id)
    if decision is None:
        raise rules.DecisionNotFoundError(decision_id)
    board = build_board(decision, store, trips, extra_person_ids=(person_id,))
    people = [(p.person_id, p.display_name, p.rsvp) for p in board.eligible]
    if all(pid != person_id for pid, _, _ in people):
        mine = next(
            (p for p in trips.participants(decision.trip_id) if p.person_id == person_id), None
        )
        if mine is not None:
            people.append((mine.person_id, mine.display_name, mine.rsvp))
    grid = [
        GridPerson(
            pid,
            name,
            rsvp,
            {d: a for (who, d), a in board.answers.items() if who == pid},
        )
        for pid, name, rsvp in people
    ]
    return AvailabilityView(
        decision=decision_view(decision, store, trips, board),
        dates=window_dates(decision),
        people=grid,
        me=person_id,
        best_windows=board.windows,
        has_data=board.has_data,
        non_responders=[participant_ref(p) for p in board.non_responders],
    )
