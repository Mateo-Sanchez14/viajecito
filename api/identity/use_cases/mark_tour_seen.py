from identity.domain import MAX_TOUR_VERSION, InvalidTourVersionError, PersonData
from identity.ports import TourStateStore


def mark_tour_seen(person_id: str, version: int, store: TourStateStore) -> PersonData:
    """Record that the person saw onboarding tour ``version``; the stored value only ever grows.

    Raises ``InvalidTourVersionError`` outside ``1..MAX_TOUR_VERSION`` without touching the store.
    """
    if not 1 <= version <= MAX_TOUR_VERSION:
        raise InvalidTourVersionError(version)
    return store.raise_tour_seen_version(person_id, version)
