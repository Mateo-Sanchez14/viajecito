from datetime import datetime

from crews.ports import CrewStore


def is_active_member(crew_id: str, person_id: str, store: CrewStore) -> bool:
    """Whether the person is an ACTIVE member of the crew (removed members are not)."""
    return store.is_active_member(crew_id, person_id)


def roster_last_synced_at(crew_id: str, store: CrewStore) -> datetime | None:
    return store.roster_last_synced_at(crew_id)
