from collections.abc import Callable
from datetime import date
from typing import Any, Protocol

from trips.domain import ParticipantData, TripData


class TripStore(Protocol):
    def create(
        self,
        crew_id: str,
        creator_id: str,
        *,
        name: str,
        type: str,
        start_on: date | None,
        end_on: date | None,
        destination_label: str,
        currency: str,
    ) -> TripData:
        """Create the trip (timezone from the crew), enroll the creator as ``in`` and make it the
        crew's default trip when the crew has none. One atomic step."""
        ...

    def list_for_crew(self, crew_id: str) -> list[TripData]: ...

    def list_active(self) -> list[TripData]:
        """Trips of every crew whose status is in ``ACTIVE_STATUSES``."""
        ...

    def get(self, trip_id: str) -> TripData | None: ...

    def update(self, trip_id: str, changes: dict[str, Any]) -> TripData: ...

    def participants(self, trip_id: str) -> list[ParticipantData]: ...

    def set_rsvp(self, trip_id: str, person_id: str, rsvp: str) -> ParticipantData:
        """Create or update the person's participation."""
        ...

    def default_trip_id(self, crew_id: str) -> str | None: ...


_default_factory: Callable[[], TripStore] | None = None


def set_default_store(factory: Callable[[], TripStore]) -> None:
    """Composition root hook: ``TripsConfig.ready()`` installs the Django store here, so use cases
    that other apps call directly (``update_trip``...) need no adapter import."""
    global _default_factory
    _default_factory = factory


def default_store() -> TripStore:
    if _default_factory is None:
        raise RuntimeError("no default trip store configured (is the trips app installed?)")
    return _default_factory()
