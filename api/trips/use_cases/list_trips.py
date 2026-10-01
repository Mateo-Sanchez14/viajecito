from trips.domain import TripData
from trips.ports import TripStore


def list_trips(crew_id: str, store: TripStore) -> list[TripData]:
    return store.list_for_crew(crew_id)
