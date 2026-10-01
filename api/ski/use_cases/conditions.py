"""Snow conditions of a trip's resorts."""

from datetime import datetime

from ski import domain
from ski.domain import Conditions
from ski.ports import SkiStore


def trip_conditions(trip_id: str, now: datetime, store: SkiStore) -> list[Conditions]:
    """Each trip resort (in trip order) with its latest report, flagged stale after 12 h.

    Reports are shared by every crew using a resort, so manual reports from outside the trip's
    crew are redacted to their numbers (see ``domain.redact_report``).
    """
    links = store.trip_resorts(trip_id)
    latest = store.latest_reports([link.resort.id for link in links])
    trip = store.trip_info(trip_id)
    members = store.crew_member_ids(trip.crew_id) if trip is not None else set()
    result = []
    for link in links:
        report = latest.get(link.resort.id)
        view = None
        if report is not None:
            view = domain.view_report(domain.redact_report(report, members), now)
        result.append(Conditions(trip_resort=link, latest=view))
    return result
