from typing import Any

from decisions.domain import rules
from decisions.domain.rules import DecisionData
from decisions.ports import DecisionStore

ALLOWED_FIELDS = ("window_start", "window_end", "min_days", "max_days", "maybe_weight", "deadline")
NOT_NULLABLE = ("window_start", "window_end", "min_days", "max_days", "maybe_weight")


def update_decision(decision_id: str, store: DecisionStore, **changes: Any) -> DecisionData:
    """Patch an open decision. Answers outside a narrowed window are kept, just not shown."""
    unknown = sorted(set(changes) - set(ALLOWED_FIELDS))
    if unknown:
        raise rules.DecisionError(f"unknown decision fields: {', '.join(unknown)}")
    for field in NOT_NULLABLE:
        if field in changes and changes[field] is None:
            raise rules.DecisionError(f"{field} must not be null")
    with store.atomic():
        current = store.get(decision_id, for_update=True)
        if current is None:
            raise rules.DecisionNotFoundError(decision_id)
        if current.status == rules.STATUS_CLOSED:
            raise rules.DecisionClosedError("the decision is closed")
        rules.validate_window(
            window_start=changes.get("window_start", current.window_start),
            window_end=changes.get("window_end", current.window_end),
            min_days=changes.get("min_days", current.min_days),
            max_days=changes.get("max_days", current.max_days),
            maybe_weight=changes.get("maybe_weight", current.maybe_weight),
        )
        return store.update(decision_id, changes) if changes else current
