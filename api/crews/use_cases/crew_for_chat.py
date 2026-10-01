from crews.ports import CrewStore


def crew_id_for_chat(chat_id: str, store: CrewStore) -> str | None:
    """The crew linked to a WhatsApp group, or ``None`` when the group is not linked."""
    return store.find_crew_id_by_chat_id(chat_id)
