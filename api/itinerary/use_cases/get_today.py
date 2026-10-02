"""Build Today from store records and an injected clock."""

from itinerary.domain.today import build_today
from itinerary.ports import default_store


def get_today(trip, now):
    store = default_store()
    return build_today(
        trip, store.entries(str(trip.id)), store.days(str(trip.id)), store.notes(str(trip.id)), now
    )
