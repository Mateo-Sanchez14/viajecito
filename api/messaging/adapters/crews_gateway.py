"""Bridges messaging to the crews app (its use cases, wired to its Django store)."""

from datetime import datetime

from django.conf import settings

from crews.adapters.django_store import DjangoCrewStore
from crews.use_cases.crew_for_chat import crew_id_for_chat
from crews.use_cases.sync_roster import (
    RosterEntry,
    RosterSyncResult,
    crews_needing_sync,
    sync_roster,
)
from messaging.adapters.gowa_factory import build_gowa_client
from messaging.gowa.parser import normalize_jid
from shared.clock import Clock, SystemClock


class GowaRosterSource:
    """The group's participants from Gowa, without the bot's own account."""

    def participants(self, chat_id: str) -> list[RosterEntry]:
        bot = normalize_jid(settings.GOWA_DEVICE_ID)
        return [
            RosterEntry(
                jid=normalize_jid(p.jid),
                phone=p.phone_number,
                lid=normalize_jid(p.lid) or None,
                display_name=p.display_name,
            )
            for p in build_gowa_client().group_participants(chat_id)
            if not bot or bot not in {normalize_jid(p.jid), normalize_jid(p.phone_number)}
        ]


class CrewsGateway:
    def __init__(self, clock: Clock | None = None) -> None:
        self._store = DjangoCrewStore()
        self._clock = clock or SystemClock()

    def crew_id_for_chat(self, chat_id: str) -> str | None:
        return crew_id_for_chat(chat_id, self._store)

    def sync_roster(self, crew_id: str) -> RosterSyncResult:
        return sync_roster(crew_id, GowaRosterSource(), self._store, self._clock)

    def crews_needing_sync(self, before: datetime) -> list[str]:
        return crews_needing_sync(before, self._store)
