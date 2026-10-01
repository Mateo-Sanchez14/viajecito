"""History of a trip resort's snow reports."""

from datetime import datetime

from ski import domain
from ski.domain import ReportView
from ski.ports import SkiStore
from ski.use_cases.trip_resorts import ResortNotOnTripError

HISTORY_LIMIT = 10


def recent_reports(
    trip_id: str, resort_id: str, now: datetime, store: SkiStore
) -> list[ReportView]:
    """The last 10 reports, newest first. Raises ``ResortNotOnTripError``."""
    if resort_id not in {link.resort.id for link in store.trip_resorts(trip_id)}:
        raise ResortNotOnTripError(resort_id)
    return [domain.view_report(r, now) for r in store.recent_reports(resort_id, HISTORY_LIMIT)]
