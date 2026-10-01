from datetime import date

from trips import domain, plugins
from trips.ports import TripStore


def create_trip(
    crew_id: str,
    creator_id: str,
    store: TripStore,
    *,
    name: str,
    type: str = domain.DEFAULT_TRIP_TYPE,
    start_on: date | None = None,
    end_on: date | None = None,
    destination_label: str = "",
    currency: str = domain.DEFAULT_CURRENCY,
) -> domain.TripData:
    domain.validate_dates(start_on, end_on)
    if not plugins.is_registered(type):
        raise domain.InvalidTripInputError(f"unknown trip type {type!r}")
    return store.create(
        crew_id,
        creator_id,
        name=domain.validate_name(name),
        type=type,
        start_on=start_on,
        end_on=end_on,
        destination_label=destination_label.strip(),
        currency=domain.normalize_currency(currency),
    )
