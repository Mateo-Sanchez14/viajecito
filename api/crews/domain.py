"""Pure crew rules (no Django, no HTTP)."""

from dataclasses import dataclass

GROUP_CHAT_SUFFIX = "@g.us"


class InvalidCrewInputError(ValueError):
    """A crew name or WhatsApp group id is not acceptable."""


@dataclass(frozen=True)
class CrewSummary:
    id: str
    name: str
    role: str
    gastito_group_url: str | None
    default_trip_id: str | None


def validate_crew_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise InvalidCrewInputError("crew name must not be empty")
    return cleaned


def validate_group_chat_id(chat_id: str) -> str:
    cleaned = chat_id.strip()
    if not cleaned.endswith(GROUP_CHAT_SUFFIX) or len(cleaned) <= len(GROUP_CHAT_SUFFIX):
        raise InvalidCrewInputError(f"chat id must end with {GROUP_CHAT_SUFFIX}")
    return cleaned


@dataclass(frozen=True)
class RosterEntry:
    """One WhatsApp group participant as reported by the gateway."""

    jid: str  # may be an ``@lid`` address when the gateway hides the phone
    phone: str | None  # phone number or phone JID, when known
    lid: str | None
    display_name: str
