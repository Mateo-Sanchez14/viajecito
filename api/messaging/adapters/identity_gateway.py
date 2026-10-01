"""Bridges messaging to the identity app (its use case, wired to its Django directory)."""

from identity.adapters.django_repos import DjangoIdentityDirectory
from identity.use_cases.people_by_ids import people_by_ids
from identity.use_cases.resolve_sender import resolve_person_id
from messaging.ports import PersonRef


class IdentityGateway:
    def __init__(self) -> None:
        self._directory = DjangoIdentityDirectory()

    def person_id_for(self, jid: str, lid: str) -> str | None:
        return resolve_person_id(jid, lid, self._directory)

    def people(self, person_ids: list[str]) -> dict[str, PersonRef]:
        found = people_by_ids(person_ids, self._directory)
        return {p.id: PersonRef(name=p.display_name or p.phone, phone=p.phone) for p in found}
