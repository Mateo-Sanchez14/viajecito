from crews.ports import CrewStore


def is_phone_eligible(phone: str, store: CrewStore) -> bool:
    """A phone may log in when it has an active crew membership or a pending invite."""
    return store.phone_has_membership_or_invite(phone)
