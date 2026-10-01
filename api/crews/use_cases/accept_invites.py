from crews.ports import CrewStore


def accept_invites(person_id: str, phone: str, store: CrewStore) -> int:
    """Turn every pending invite for ``phone`` into an active membership; return how many."""
    return store.accept_pending_invites(person_id, phone)
