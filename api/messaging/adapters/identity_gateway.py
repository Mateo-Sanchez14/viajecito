"""Bridges messaging to the identity app (its use case, wired to its Django directory)."""

from identity.adapters.django_repos import DjangoIdentityDirectory
from identity.use_cases.resolve_sender import resolve_person_id


class IdentityGateway:
    def __init__(self) -> None:
        self._directory = DjangoIdentityDirectory()

    def person_id_for(self, jid: str, lid: str) -> str | None:
        return resolve_person_id(jid, lid, self._directory)
