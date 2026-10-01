from decisions.domain import rules
from decisions.domain.rules import DecisionData
from decisions.ports import DecisionStore


def reopen_decision(decision_id: str, store: DecisionStore) -> DecisionData:
    """Back to ``open`` with the outcome cleared. The trip's dates are left as they are."""
    with store.atomic():
        current = store.get(decision_id, for_update=True)
        if current is None:
            raise rules.DecisionNotFoundError(decision_id)
        if current.status == rules.STATUS_OPEN:
            raise rules.DecisionOpenError("the decision is already open")
        if store.open_dates_for_trip(current.trip_id) is not None:
            raise rules.DecisionAlreadyOpenError("the trip already has an open dates decision")
        return store.reopen(decision_id)
