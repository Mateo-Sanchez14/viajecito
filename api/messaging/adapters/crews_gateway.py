"""Bridges messaging to the crews app (its use cases, wired to its Django store)."""

import logging
from datetime import datetime

from django.conf import settings

from crews.adapters.django_store import DjangoCrewStore
from crews.use_cases.chat_for_crew import chat_id_for_crew
from crews.use_cases.crew_for_chat import crew_id_for_chat
from crews.use_cases.membership import is_active_member, roster_last_synced_at
from crews.use_cases.sync_roster import (
    RosterEntry,
    RosterSyncResult,
    crews_needing_sync,
    sync_roster,
)
from messaging.adapters.gowa_factory import build_gowa_client
from messaging.adapters.provider import build_waha_client
from messaging.gowa.parser import normalize_jid
from messaging.waha.parser import normalize_jid as normalize_waha_jid
from shared.clock import Clock, SystemClock

logger = logging.getLogger(__name__)


class GowaRosterSource:
    """The group's participants from Gowa, without the bot's own account."""

    def participants(self, chat_id: str) -> list[RosterEntry]:
        bot = normalize_jid(settings.GOWA_DEVICE_ID)
        if bot and "@" not in bot:
            logger.warning(
                "GOWA_DEVICE_ID %r is not a JID (<digits>@s.whatsapp.net); the bot account "
                "will not be excluded from roster syncs",
                bot,
            )
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


class WahaRosterSource:
    """The group's participants from WAHA, without the session's own account."""

    def participants(self, chat_id: str) -> list[RosterEntry]:
        client = build_waha_client()
        bot = client.own_jids()
        entries = []
        for p in client.group_participants(chat_id):
            if p.jid in bot or (p.phone_number and p.phone_number in bot):
                continue
            phone = normalize_waha_jid(p.phone_number)
            entries.append(
                RosterEntry(
                    jid=phone or p.jid,
                    phone=phone or None,
                    lid=p.lid,
                    display_name=p.display_name,
                )
            )
        return entries


def roster_source() -> GowaRosterSource | WahaRosterSource:
    return WahaRosterSource() if settings.WHATSAPP_PROVIDER == "waha" else GowaRosterSource()


class CrewsGateway:
    def __init__(self, clock: Clock | None = None) -> None:
        self._store = DjangoCrewStore()
        self._clock = clock or SystemClock()

    def crew_id_for_chat(self, chat_id: str) -> str | None:
        return crew_id_for_chat(chat_id, self._store)

    def chat_id_for_crew(self, crew_id: str) -> str | None:
        return chat_id_for_crew(crew_id, self._store)

    def is_active_member(self, crew_id: str, person_id: str) -> bool:
        return is_active_member(crew_id, person_id, self._store)

    def roster_last_synced_at(self, crew_id: str) -> datetime | None:
        return roster_last_synced_at(crew_id, self._store)

    def sync_roster(self, crew_id: str) -> RosterSyncResult:
        return sync_roster(crew_id, roster_source(), self._store, self._clock)

    def crews_needing_sync(self, before: datetime) -> list[str]:
        return crews_needing_sync(before, self._store)
