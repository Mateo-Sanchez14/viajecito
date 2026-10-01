from dataclasses import dataclass

from crews.domain import validate_crew_name, validate_group_chat_id
from crews.ports import CrewStore
from shared.phone import normalize_phone


@dataclass(frozen=True)
class BootstrapResult:
    crew_id: str
    created: bool


def bootstrap_crew(name: str, chat_id: str, admin_phone: str, store: CrewStore) -> BootstrapResult:
    """Create a crew, its WhatsApp group link and the admin membership. Idempotent per chat id.

    Raises ``InvalidCrewInputError`` or ``InvalidPhoneError`` on bad input.
    """
    cleaned_name = validate_crew_name(name)
    cleaned_chat = validate_group_chat_id(chat_id)
    phone = normalize_phone(admin_phone)
    existing = store.find_crew_id_by_chat_id(cleaned_chat)
    if existing is not None:
        return BootstrapResult(existing, created=False)
    crew_id = store.create_crew(cleaned_name, cleaned_chat)
    store.ensure_admin(crew_id, phone)
    return BootstrapResult(crew_id, created=True)
