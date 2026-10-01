from trips import ports


def default_trip_for_crew(crew_id: str) -> str | None:
    """The id of the crew's default trip, or ``None`` when it has none."""
    return ports.default_store().default_trip_id(crew_id)
