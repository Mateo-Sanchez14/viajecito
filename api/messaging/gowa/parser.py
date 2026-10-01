"""Turns a Gowa webhook payload into a ``GroupMessage`` (shape: Gowa docs/webhook-payload.md)."""

from datetime import datetime
from typing import Any

from messaging.domain import GroupMessage

__all__ = ["GroupMessage", "normalize_jid", "parse_message_event"]


def normalize_jid(raw: str | None) -> str:
    """Strip whitespace and the ``:device`` part of a JID (``123:12@s.whatsapp.net`` → ``123@…``)."""
    if not raw:
        return ""
    jid = raw.strip()
    user, sep, server = jid.partition("@")
    if not sep:
        return jid
    return f"{user.split(':', 1)[0]}@{server}"


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else None


def parse_message_event(payload: dict) -> GroupMessage | None:
    """Return the message, or ``None`` when the event is not a ``message`` or lacks an id/chat."""
    if payload.get("event") != "message":
        return None
    body = payload.get("payload")
    if not isinstance(body, dict):
        return None
    message_id = _text(body.get("id"))
    chat_id = normalize_jid(_text(body.get("chat_id")))
    if not message_id or not chat_id:
        return None
    sender = normalize_jid(_text(body.get("from")))
    lid = normalize_jid(_text(body.get("from_lid")))
    if sender.endswith("@lid"):  # groups may report the sender only as a LID
        lid = lid or sender
        sender = ""
    return GroupMessage(
        device_id=normalize_jid(_text(payload.get("device_id"))),
        message_id=message_id,
        chat_id=chat_id,
        sender_jid=sender,
        sender_lid=lid,
        sender_name=_text(body.get("from_name")),
        body=body.get("body") if isinstance(body.get("body"), str) else "",
        replied_to_id=_text(body.get("replied_to_id")),
        timestamp=_timestamp(body.get("timestamp")),
        is_from_me=body.get("is_from_me") is True,
    )
