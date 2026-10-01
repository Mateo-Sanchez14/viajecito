from crews import ports


def active_member_ids(crew_id: str) -> list[str]:
    """Person ids of the crew's ACTIVE members, oldest membership first."""
    return ports.default_store().active_member_ids(crew_id)
