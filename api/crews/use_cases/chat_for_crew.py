from crews.ports import CrewStore


def chat_id_for_crew(crew_id: str, store: CrewStore) -> str | None:
    """The WhatsApp group linked to a crew, or ``None`` when it has none."""
    return store.chat_id_for_crew(crew_id)
