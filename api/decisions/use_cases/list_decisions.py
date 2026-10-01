from decisions.domain import rules
from decisions.ports import DecisionStore, TripGateway
from decisions.use_cases.board import DecisionView, build_board, decision_view


def list_decisions(
    trip_id: str, store: DecisionStore, trips: TripGateway, status: str | None = None
) -> list[DecisionView]:
    """The trip's decisions, newest first, optionally filtered by status."""
    if status is not None and status not in rules.STATUSES:
        raise rules.DecisionError(f"status must be one of {', '.join(rules.STATUSES)}")
    return [
        decision_view(d, store, trips, build_board(d, store, trips, with_windows=False))
        for d in store.list_for_trip(trip_id, status)
    ]


def get_decision(decision_id: str, store: DecisionStore, trips: TripGateway) -> DecisionView:
    decision = store.get(decision_id)
    if decision is None:
        raise rules.DecisionNotFoundError(decision_id)
    return decision_view(decision, store, trips)
