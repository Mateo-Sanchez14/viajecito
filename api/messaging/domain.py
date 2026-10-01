"""Pure messaging types (no Django, no HTTP)."""

from dataclasses import dataclass
from datetime import datetime

GROUP_CHAT_SUFFIX = "@g.us"


@dataclass(frozen=True)
class GroupMessage:
    """A ``message`` event from Gowa, normalized. Direct chats parse too; callers filter them."""

    device_id: str
    message_id: str
    chat_id: str
    sender_jid: str  # "" when the sender is only known by LID
    sender_lid: str  # "" when absent
    sender_name: str
    body: str
    replied_to_id: str
    timestamp: datetime | None
    is_from_me: bool

    @property
    def is_group(self) -> bool:
        return self.chat_id.endswith(GROUP_CHAT_SUFFIX)
