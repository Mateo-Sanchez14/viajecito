"""Members post a manual snow report for one of the trip's resorts."""

from datetime import datetime, timedelta

from ski import domain
from ski.domain import ManualReportInput, ReportView
from ski.ports import SkiStore
from ski.use_cases.access import ski_enabled
from ski.use_cases.trip_resorts import ResortNotOnTripError


class TripNotFoundError(LookupError):
    pass


class ModuleNotEnabledError(LookupError):
    pass


class RateLimitedError(Exception):
    pass


def add_manual_report(
    trip_id: str,
    resort_id: str,
    person_id: str,
    report: ManualReportInput,
    now: datetime,
    store: SkiStore,
    *,
    per_hour: int,
) -> ReportView:
    """Raises ``TripNotFoundError``, ``ModuleNotEnabledError``, ``ResortNotOnTripError``,
    ``domain.InvalidSkiInputError`` or ``RateLimitedError`` (more than ``per_hour`` reports for
    the resort in the last hour)."""
    trip = store.trip_info(trip_id)
    if trip is None:
        raise TripNotFoundError(trip_id)
    if not ski_enabled(trip.type):
        raise ModuleNotEnabledError(trip_id)
    if resort_id not in {link.resort.id for link in store.trip_resorts(trip_id)}:
        raise ResortNotOnTripError(resort_id)
    clean = domain.validate_manual_report(report)
    if store.count_manual_reports(resort_id, now - timedelta(hours=1)) >= per_hour:
        raise RateLimitedError(resort_id)
    saved = store.add_manual_report(resort_id, person_id, clean, now)
    return domain.view_report(saved, now)
