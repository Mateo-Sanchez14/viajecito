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
    """The last 10 reports, newest first, redacted for the trip's crew like the conditions.
    Raises ``ResortNotOnTripError``."""
    if resort_id not in {link.resort.id for link in store.trip_resorts(trip_id)}:
        raise ResortNotOnTripError(resort_id)
    trip = store.trip_info(trip_id)
    members = store.crew_member_ids(trip.crew_id) if trip is not None else set()
    reports = store.recent_reports(resort_id, HISTORY_LIMIT)
    return [domain.view_report(domain.redact_report(r, members), now) for r in reports]
