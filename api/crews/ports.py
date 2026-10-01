from datetime import datetime
from typing import Protocol

from crews.domain import CrewSummary, RosterEntry


class CrewStore(Protocol):
    def find_crew_id_by_chat_id(self, chat_id: str) -> str | None: ...

    def create_crew(self, name: str, chat_id: str) -> str: ...

    def ensure_admin(self, crew_id: str, phone: str) -> None:
        """Get-or-create the person for ``phone`` and make them an active admin of the crew."""
        ...

    def phone_has_membership_or_invite(self, phone: str) -> bool: ...

    def summaries_for(self, person_id: str) -> list[CrewSummary]: ...

    def accept_pending_invites(self, person_id: str, phone: str) -> int: ...

    def is_active_member(self, crew_id: str, person_id: str) -> bool: ...

    def roster_last_synced_at(self, crew_id: str) -> datetime | None: ...

    def chat_id_for_crew(self, crew_id: str) -> str | None: ...

    def upsert_roster_member(
        self, crew_id: str, *, phone: str, lid: str | None, display_name: str
    ) -> bool:
        """Ensure the person, their WhatsApp identity and a ``group_sync`` membership exist.

        Never changes an existing membership (role, status, source). Returns whether the
        membership was created.
        """
        ...

    def mark_roster_synced(self, crew_id: str, when: datetime) -> None: ...

    def crews_needing_sync(self, before: datetime) -> list[str]:
        """Crews whose roster was never synced or was last synced before ``before``."""
        ...


class RosterSource(Protocol):
    def participants(self, chat_id: str) -> list[RosterEntry]:
        """The current members of a WhatsApp group. May raise when the gateway is down."""
        ...
