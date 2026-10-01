"""Turns a WAHA ``message`` webhook into a ``GroupMessage``.

Shape follows the WAHA docs (how-to/events, how-to/receive-messages): envelope
``{event, session, engine, payload}`` and, inside ``payload``, ``id``, ``timestamp`` (unix
seconds), ``from`` (the chat), ``fromMe``, ``participant`` (the sender in groups), ``body`` and
``replyTo``. Engine-specific extras (``_data``) are read defensively.
"""

from datetime import UTC, datetime
from typing import Any

from messaging.domain import GroupMessage

__all__ = ["GroupMessage", "normalize_jid", "parse_message_event"]

USER_SERVER = "s.whatsapp.net"


def normalize_jid(raw: str | None) -> str:
    """Strip whitespace and the ``:device`` part; WAHA's ``@c.us`` becomes ``@s.whatsapp.net``."""
    if not raw:
        return ""
    jid = raw.strip()
    user, sep, server = jid.partition("@")
    if not sep:
        return jid
    if server == "c.us":
        server = USER_SERVER
    return f"{user.split(':', 1)[0]}@{server}"


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _timestamp(value: Any) -> datetime | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    try:
        return datetime.fromtimestamp(value, UTC)
    except (OverflowError, OSError, ValueError):
        return None


def _sender(body: dict, chat_id: str) -> tuple[str, str]:
    """``(jid, lid)`` of the author. Groups carry it in ``participant``; direct chats in ``from``."""
    info = _dict(_dict(body.get("_data")).get("Info"))
    raw = _text(body.get("participant")) or _text(info.get("Sender"))
    if not raw and not chat_id.endswith("@g.us"):
        raw = _text(body.get("from"))
    sender, lid = normalize_jid(raw), ""
    if sender.endswith("@lid"):
        lid, sender = sender, ""
        alt = normalize_jid(_text(info.get("SenderAlt")))  # GOWS: the phone JID behind the LID
        if alt.endswith(f"@{USER_SERVER}"):
            sender = alt
    return sender, lid


def _sender_name(body: dict) -> str:
    data = _dict(body.get("_data"))
    return (
        _text(data.get("notifyName"))
        or _text(data.get("pushName"))
        or _text(_dict(data.get("Info")).get("PushName"))
    )


def parse_message_event(payload: dict) -> GroupMessage | None:
    """Return the message, or ``None`` when the event is not a ``message`` or lacks an id/chat."""
    if payload.get("event") != "message":
        return None
    body = payload.get("payload")
    if not isinstance(body, dict):
        return None
    message_id = _text(body.get("id"))
    chat_id = normalize_jid(_text(body.get("from")))
    if not message_id or not chat_id:
        return None
    sender, lid = _sender(body, chat_id)
    return GroupMessage(
        device_id=_text(payload.get("session")),
        message_id=message_id,
        chat_id=chat_id,
        sender_jid=sender,
        sender_lid=lid,
        sender_name=_sender_name(body),
        body=body.get("body") if isinstance(body.get("body"), str) else "",
        replied_to_id=_text(_dict(body.get("replyTo")).get("id")),
        timestamp=_timestamp(body.get("timestamp")),
        is_from_me=body.get("fromMe") is True,
    )
