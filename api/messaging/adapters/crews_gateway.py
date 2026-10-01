"""Bridges messaging to the crews app (its use cases, wired to its Django store)."""

from crews.adapters.django_store import DjangoCrewStore
from crews.use_cases.crew_for_chat import crew_id_for_chat


class CrewsGateway:
    def __init__(self) -> None:
        self._store = DjangoCrewStore()

    def crew_id_for_chat(self, chat_id: str) -> str | None:
        return crew_id_for_chat(chat_id, self._store)
