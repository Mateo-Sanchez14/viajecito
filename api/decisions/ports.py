"""What the decisions use cases need from the outside world."""

from contextlib import AbstractContextManager
from datetime import date, datetime
from typing import Any, Protocol

from decisions.domain.rules import DecisionData, Participant, PersonRef


class DecisionStore(Protocol):
    def atomic(self) -> AbstractContextManager[None]:
        """One database transaction (nests inside the caller's)."""
        ...

    def create(self, trip_id: str, opened_by: str, fields: dict[str, Any]) -> DecisionData:
        """Raises ``DecisionAlreadyOpenError`` when the trip already has an open dates decision."""
        ...

    def get(self, decision_id: str, *, for_update: bool = False) -> DecisionData | None: ...

    def list_for_trip(self, trip_id: str, status: str | None) -> list[DecisionData]:
        """Newest first."""
        ...

    def open_dates_for_trip(self, trip_id: str) -> DecisionData | None: ...

    def update(self, decision_id: str, changes: dict[str, Any]) -> DecisionData: ...

    def close(
        self, decision_id: str, closed_by: str, start_on: date, end_on: date, closed_at: datetime
    ) -> DecisionData: ...

    def reopen(self, decision_id: str) -> DecisionData:
        """Raises ``DecisionAlreadyOpenError`` when another dates decision is open."""
        ...

    def answers(
        self, trip_id: str, start: date, end: date, person_ids: list[str]
    ) -> dict[tuple[str, date], str]:
        """The ``yes|maybe|no`` rows of those people between ``start`` and ``end`` inclusive."""
        ...

    def apply_answers(self, trip_id: str, person_id: str, changes: dict[date, str | None]) -> None:
        """Upsert the person's answers; a ``None`` value deletes the day."""
        ...


class TripGateway(Protocol):
    def participants(self, trip_id: str) -> list[Participant]:
        """Every active crew member with their RSVP (``pending`` without a row)."""
        ...

    def set_trip_dates(self, trip_id: str, actor_id: str, start_on: date, end_on: date) -> None:
        """Write the trip's dates; runs inside the caller's transaction."""
        ...

    def names(self, person_ids: list[str]) -> dict[str, PersonRef]: ...
