"""Members post a manual snow report for one of the trip's resorts."""

import math
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
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(retry_after_seconds)
        self.retry_after_seconds = retry_after_seconds


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
    ``domain.InvalidSkiInputError`` or ``RateLimitedError`` (the person already posted ``per_hour``
    reports for this resort in the last hour: the limit is per resort and reporter, so another
    trip's reports never block yours)."""
    trip = store.trip_info(trip_id)
    if trip is None:
        raise TripNotFoundError(trip_id)
    if not ski_enabled(trip.type):
        raise ModuleNotEnabledError(trip_id)
    if resort_id not in {link.resort.id for link in store.trip_resorts(trip_id)}:
        raise ResortNotOnTripError(resort_id)
    clean = domain.validate_manual_report(report)
    window = timedelta(hours=1)
    times = store.manual_report_times(resort_id, person_id, now - window)
    if len(times) >= per_hour:
        # a slot frees up when the report that keeps us at the limit leaves the window
        frees_at = times[len(times) - per_hour] + window
        raise RateLimitedError(max(math.ceil((frees_at - now).total_seconds()), 1))
    saved = store.add_manual_report(resort_id, person_id, clean, now)
    return domain.view_report(saved, now)
