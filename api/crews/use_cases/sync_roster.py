from dataclasses import dataclass
from datetime import datetime

from crews.domain import RosterEntry
from crews.ports import CrewStore, RosterSource
from shared.clock import Clock
from shared.phone import InvalidPhoneError, normalize_phone

__all__ = ["RosterEntry", "RosterSyncResult", "crews_needing_sync", "sync_roster"]

USER_SERVER = "s.whatsapp.net"


@dataclass(frozen=True)
class RosterSyncResult:
    created: int  # new memberships
    existing: int  # people who were already members (any role or status)
    skipped: int  # participants without a usable phone number


def _phone_of(entry: RosterEntry) -> str | None:
    """E.164 phone of a participant, from ``phone`` first and then from a phone JID."""
    for raw in (entry.phone, entry.jid):
        if not raw:
            continue
        user, _, server = raw.strip().partition("@")
        if server not in ("", USER_SERVER):
            continue  # an @lid carries no phone number
        digits = user.split(":", 1)[0].lstrip("+")
        try:
            return normalize_phone(f"+{digits}")
        except InvalidPhoneError:
            continue
    return None


def sync_roster(
    crew_id: str, source: RosterSource, store: CrewStore, clock: Clock
) -> RosterSyncResult:
    """Upsert every participant of the crew's WhatsApp group as a member.

    Members who left the group are NOT removed, admins are never downgraded and removed members
    are never reactivated. Raises whatever the source raises; ``last_synced_at`` is only recorded
    after a full pass.
    """
    chat_id = store.chat_id_for_crew(crew_id)
    if chat_id is None:
        raise ValueError(f"crew {crew_id} has no WhatsApp group")
    created = existing = skipped = 0
    for entry in source.participants(chat_id):
        phone = _phone_of(entry)
        if phone is None:
            skipped += 1
            continue
        lid = entry.lid or (entry.jid if entry.jid.endswith("@lid") else None)
        if store.upsert_roster_member(
            crew_id, phone=phone, lid=lid, display_name=entry.display_name
        ):
            created += 1
        else:
            existing += 1
    store.mark_roster_synced(crew_id, clock.now())
    return RosterSyncResult(created, existing, skipped)


def crews_needing_sync(before: datetime, store: CrewStore) -> list[str]:
    return store.crews_needing_sync(before)
