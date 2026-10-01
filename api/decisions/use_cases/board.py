from dataclasses import dataclass
from datetime import date, timedelta

from decisions.domain.best_window import best_windows
from decisions.domain.rules import Board, DecisionData, Participant, PersonRef
from decisions.ports import DecisionStore, TripGateway


@dataclass(frozen=True)
class DecisionView:
    decision: DecisionData
    opened_by: PersonRef
    closed_by: PersonRef | None
    respondents: int
    eligible: int


def build_board(
    decision: DecisionData,
    store: DecisionStore,
    trips: TripGateway,
    *,
    with_windows: bool = True,
    extra_person_ids: tuple[str, ...] = (),
) -> Board:
    """Eligible people, their answers inside the window, the best windows and who has not voted.

    Eligible = active crew members minus participants who answered ``out``. ``extra_person_ids``
    only widens which people's answers are loaded (the caller's own row when they are ``out``).
    """
    eligible = tuple(p for p in trips.participants(decision.trip_id) if p.rsvp != "out")
    ids = [p.person_id for p in eligible]
    answers = store.answers(
        decision.trip_id,
        decision.window_start,
        decision.window_end,
        [*ids, *(i for i in extra_person_ids if i not in ids)],
    )
    responded = {person for person, _ in answers}
    windows = ()
    if with_windows:
        windows = tuple(
            best_windows(
                window_start=decision.window_start,
                window_end=decision.window_end,
                min_days=decision.min_days,
                max_days=decision.max_days,
                people=ids,
                answers=answers,
                maybe_weight=decision.maybe_weight,
                limit=3,
            )
        )
    return Board(
        decision=decision,
        eligible=eligible,
        answers=answers,
        windows=windows,
        has_data=any(person in responded for person in ids),
        non_responders=tuple(p for p in eligible if p.person_id not in responded),
    )


def window_dates(decision: DecisionData) -> list[date]:
    days = (decision.window_end - decision.window_start).days + 1
    return [decision.window_start + timedelta(days=i) for i in range(days)]


def decision_view(
    decision: DecisionData, store: DecisionStore, trips: TripGateway, board: Board | None = None
) -> DecisionView:
    board = board or build_board(decision, store, trips, with_windows=False)
    ids = [decision.opened_by] + ([decision.closed_by] if decision.closed_by else [])
    names = trips.names(ids)
    closer = None
    if decision.closed_by:
        closer = names.get(decision.closed_by) or PersonRef(decision.closed_by, "")
    return DecisionView(
        decision=decision,
        opened_by=names.get(decision.opened_by) or PersonRef(decision.opened_by, ""),
        closed_by=closer,
        respondents=board.respondents,
        eligible=len(board.eligible),
    )


def participant_ref(person: Participant) -> PersonRef:
    return PersonRef(person.person_id, person.display_name)
