from dataclasses import dataclass
from enum import StrEnum

from decisions.domain.rules import Board, TripInfo
from decisions.ports import DecisionStore, TripGateway
from decisions.use_cases.board import build_board


class DatesState(StrEnum):
    NO_TRIP = "no_trip"  # the crew has no (active) default trip
    FIXED = "fixed"  # no open decision and the trip already has dates
    NO_DECISION = "no_decision"  # no open decision and no dates
    OPEN = "open"


@dataclass(frozen=True)
class DatesStatus:
    state: DatesState
    trip: TripInfo | None = None
    board: Board | None = None


def dates_status(
    default_trip_id: str | None, store: DecisionStore, trips: TripGateway
) -> DatesStatus:
    """Where the dates stand for the crew's default trip (what ``/viaje fechas`` reports)."""
    trip = next((t for t in trips.active_trips() if t.id == default_trip_id), None)
    if default_trip_id is None or trip is None:
        return DatesStatus(DatesState.NO_TRIP)
    decision = store.open_dates_for_trip(trip.id)
    if decision is not None:
        return DatesStatus(DatesState.OPEN, trip, build_board(decision, store, trips))
    if trip.start_on is not None and trip.end_on is not None:
        return DatesStatus(DatesState.FIXED, trip)
    return DatesStatus(DatesState.NO_DECISION, trip)
