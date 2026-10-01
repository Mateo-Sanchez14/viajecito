"""Pure push payload rules: what a notification says, where it opens and which category it is."""

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

from notifications.copy.es_ar import ALGUIEN, TITLE_DEFAULT

MAX_BODY_CHARS = 240
MAX_TITLE_CHARS = 100
MAX_URL_CHARS = 500
MAX_TAG_CHARS = 64
MAX_PAYLOAD_BYTES = 3000

_MENTION = re.compile(r"\{@([^{}]*)\}")
_SPACES = re.compile(r"[ \t]{2,}")

_CATEGORY_PREFIXES = (
    ("itinerary:digest:", "digest"),
    ("notifications:countdown:", "countdown"),
    ("proposals:", "proposals"),
)
DEFAULT_CATEGORY = "reminders"


class Draftish(Protocol):
    """The slice of a ``messaging.reminders.ReminderDraft`` a push needs."""

    title: str
    body: str
    dedupe_key: str
    url_path: str


_PHONE_LIKE = re.compile(r"\+?[\d\s().-]{6,}")


def neutral_names(names: Mapping[str, str]) -> dict[str, str]:
    """Display names safe for a lock screen: a person without a real name (the directory falls back
    to their phone) becomes a neutral word, never a phone number."""
    return {
        person_id: ALGUIEN if not name.strip() or _PHONE_LIKE.fullmatch(name.strip()) else name
        for person_id, name in names.items()
    }


def category_of(dedupe_key: str) -> str:
    for prefix, category in _CATEGORY_PREFIXES:
        if dedupe_key.startswith(prefix):
            return category
    return DEFAULT_CATEGORY


def _plain_body(body: str, names: Mapping[str, str]) -> str:
    text = _MENTION.sub(lambda m: names.get(m.group(1), ""), body)
    return _SPACES.sub(" ", text).strip()


def _truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def safe_path(path: str) -> str:
    """Same-origin absolute path or ``/``: anything else could open another site."""
    if (
        not path.startswith("/")
        or path.startswith(("//", "/\\"))
        or len(path) > MAX_URL_CHARS
        or any(ord(ch) < 0x20 or ch == "\x7f" for ch in path)
    ):
        return "/"
    return path


def _size(payload: dict[str, object]) -> int:
    return len(json.dumps(payload, ensure_ascii=False).encode())


def build_payload(draft: Draftish, names: Mapping[str, str], now_ts: int) -> dict[str, object]:
    """``{"title", "body", "url", "tag", "ts"}``, JSON-serialized at most ``MAX_PAYLOAD_BYTES``.

    Deviates from the contract's ``build_payload(draft, person)`` on purpose: the domain stays
    pure, so the caller resolves the ``{@person_id}`` names (already made lock-screen safe by
    ``neutral_names``) and the clock reading, and the payload is the same for every recipient.

    ``names`` maps person ids to display names for the ``{@person_id}`` mention tokens.
    """
    payload: dict[str, object] = {
        "title": _truncate(draft.title or TITLE_DEFAULT, MAX_TITLE_CHARS),
        "body": _truncate(_plain_body(draft.body, names), MAX_BODY_CHARS),
        "url": safe_path(draft.url_path),
        "tag": draft.dedupe_key[:MAX_TAG_CHARS],
        "ts": now_ts,
    }
    body = str(payload["body"])
    while _size(payload) > MAX_PAYLOAD_BYTES and body:
        body = _truncate(body, max(len(body) // 2, 1)) if len(body) > 1 else ""
        payload["body"] = body
    if _size(payload) > MAX_PAYLOAD_BYTES:
        payload["tag"] = ""
    return payload


@dataclass(frozen=True)
class PushContent:
    """A push that is not a reminder draft (the settings page's test notification)."""

    title: str
    body: str
    dedupe_key: str
    url_path: str
