from crews.domain import NotMember
from crews.ports import CrewStore


def require_active_member(person_id: str, crew_id: str, store: CrewStore) -> None:
    """Raise ``NotMember`` unless the person is an ACTIVE member of the crew."""
    if not store.is_active_member(crew_id, person_id):
        raise NotMember(f"{person_id} is not an active member of {crew_id}")
