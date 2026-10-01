"""Snow conditions of a trip's resorts."""

from datetime import datetime

from ski import domain
from ski.domain import Conditions
from ski.ports import SkiStore


def trip_conditions(trip_id: str, now: datetime, store: SkiStore) -> list[Conditions]:
    """Each trip resort (in trip order) with its latest report, flagged stale after 12 h."""
    links = store.trip_resorts(trip_id)
    latest = store.latest_reports([link.resort.id for link in links])
    return [
        Conditions(
            trip_resort=link,
            latest=domain.view_report(latest[link.resort.id], now)
            if link.resort.id in latest
            else None,
        )
        for link in links
    ]
