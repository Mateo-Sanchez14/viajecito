"""Bridges identity ports to the crews app, through its use cases only."""

from crews.adapters.django_store import DjangoCrewStore
from crews.domain import CrewSummary
from crews.use_cases.accept_invites import accept_invites
from crews.use_cases.crews_for import crews_for
from crews.use_cases.is_phone_eligible import is_phone_eligible


class CrewsGateway:
    def __init__(self) -> None:
        self._store = DjangoCrewStore()

    def is_eligible(self, phone: str) -> bool:
        return is_phone_eligible(phone, self._store)

    def accept(self, person_id: str, phone: str) -> int:
        return accept_invites(person_id, phone, self._store)

    def crews_for(self, person_id: str) -> list[CrewSummary]:
        return crews_for(person_id, self._store)
