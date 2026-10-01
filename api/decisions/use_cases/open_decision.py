from datetime import date, datetime
from decimal import Decimal

from decisions.domain import rules
from decisions.domain.rules import DecisionData
from decisions.ports import DecisionStore


def open_decision(
    trip_id: str,
    opener_id: str,
    store: DecisionStore,
    *,
    window_start: date,
    window_end: date,
    min_days: int,
    max_days: int | None = None,
    maybe_weight: Decimal | None = None,
    deadline: datetime | None = None,
) -> DecisionData:
    """Open the trip's dates decision. The caller authorizes the actor (``member_of_trip``)."""
    max_days = min_days if max_days is None else max_days
    weight = rules.DEFAULT_MAYBE_WEIGHT if maybe_weight is None else maybe_weight
    rules.validate_window(
        window_start=window_start,
        window_end=window_end,
        min_days=min_days,
        max_days=max_days,
        maybe_weight=weight,
    )
    with store.atomic():
        if store.open_dates_for_trip(trip_id) is not None:
            raise rules.DecisionAlreadyOpenError("the trip already has an open dates decision")
        return store.create(
            trip_id,
            opener_id,
            {
                "kind": rules.KIND_DATES,
                "window_start": window_start,
                "window_end": window_end,
                "min_days": min_days,
                "max_days": max_days,
                "maybe_weight": weight,
                "deadline": deadline,
            },
        )
