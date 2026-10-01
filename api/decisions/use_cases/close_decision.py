from datetime import date

from decisions.domain import rules
from decisions.domain.rules import DecisionData
from decisions.ports import DecisionStore, TripGateway
from decisions.use_cases.board import build_board
from shared.clock import Clock, SystemClock


def close_decision(
    decision_id: str,
    actor_id: str,
    store: DecisionStore,
    trips: TripGateway,
    *,
    start_on: date | None = None,
    end_on: date | None = None,
    clock: Clock | None = None,
) -> DecisionData:
    """Close the decision and write the chosen dates to the trip, in ONE transaction.

    Without explicit dates the best window #1 wins. A failure while updating the trip rolls the
    closing back. Closing a trip that already has dates overwrites them.
    """
    now = (clock or SystemClock()).now()
    with store.atomic():
        current = store.get(decision_id, for_update=True)
        if current is None:
            raise rules.DecisionNotFoundError(decision_id)
        if current.status == rules.STATUS_CLOSED:
            raise rules.DecisionClosedError("the decision is already closed")
        best = ()
        if start_on is None and end_on is None:
            board = build_board(current, store, trips)
            if not board.has_data:  # an unanswered window would only echo the weekend tie-break
                raise rules.NoWindowError("nobody has answered yet; send explicit dates")
            best = board.windows
        start, end = rules.choose_close_window(current, best, start_on, end_on)
        closed = store.close(decision_id, actor_id, start, end, now)
        trips.set_trip_dates(current.trip_id, actor_id, start, end)
        return closed
