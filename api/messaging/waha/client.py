"""Thin synchronous client for WAHA (devlikeapro/waha).

Endpoints (WAHA docs): ``POST /api/sendText``, ``GET /api/{session}/groups/{id}/participants/v2``,
``GET /api/{session}/lids/{lid}`` and ``GET /api/sessions/{session}``; auth is ``X-Api-Key``.
"""

import logging
from collections.abc import Sequence
from typing import Any
from urllib.parse import quote

import httpx

from messaging.ports import GatewayError, Participant
from messaging.waha.parser import USER_SERVER, normalize_jid, stanza_id

logger = logging.getLogger(__name__)

ADMIN_ROLES = {"admin", "superadmin"}


def to_chat_id(jid: str) -> str:
    """WAHA addresses people as ``<digits>@c.us``; groups keep ``@g.us``."""
    user, sep, server = normalize_jid(jid).partition("@")
    return f"{user}@c.us" if sep and server == USER_SERVER else normalize_jid(jid)


def _seg(value: str) -> str:
    """One URL path segment: ``@`` and friends are percent-encoded."""
    return quote(value, safe="")


def _phone_jid(raw: Any) -> str:
    """A phone JID from ``<digits>@c.us`` or bare digits; '' for anything else."""
    if not isinstance(raw, str) or not raw.strip():
        return ""
    return normalize_jid(raw if "@" in raw else f"{raw.strip()}@{USER_SERVER}")


class WahaClient:
    def __init__(
        self, base_url: str, api_key: str = "", session: str = "default", timeout: float = 10
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._session = session
        self._timeout = timeout
        self._headers = {"X-Api-Key": api_key} if api_key else {}

    def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            response = httpx.request(
                method,
                f"{self._base_url}{path}",
                headers=self._headers,
                timeout=self._timeout,
                **kwargs,
            )
        except httpx.HTTPError as exc:
            raise GatewayError(f"waha request failed: {exc.__class__.__name__}") from exc
        if response.status_code >= 400:
            raise GatewayError(f"waha responded with HTTP {response.status_code}")
        return response

    def send_text(
        self,
        to_jid: str,
        body: str,
        reply_to: str | None = None,
        mentions: Sequence[str] = (),
    ) -> str:
        payload: dict[str, Any] = {
            "session": self._session,
            "chatId": to_chat_id(to_jid),
            "text": body,
        }
        if reply_to:
            payload["reply_to"] = reply_to
        if mentions:
            payload["mentions"] = [to_chat_id(jid) for jid in mentions]
        response = self._request("POST", "/api/sendText", json=payload)
        try:
            message_id = response.json()["id"]
        except (ValueError, KeyError, TypeError) as exc:
            raise GatewayError("waha response has no id") from exc
        if isinstance(message_id, dict):  # some engines return the serialized message key
            message_id = message_id.get("_serialized")
        if not message_id or not isinstance(message_id, str):
            raise GatewayError("waha response has an empty id")
        return stanza_id(message_id)  # the ledger keys cards by the bare stanza id

    def group_participants(self, chat_id: str) -> list[Participant]:
        response = self._request(
            "GET", f"/api/{_seg(self._session)}/groups/{_seg(chat_id)}/participants/v2"
        )
        try:
            items = [item for item in response.json() if item.get("role") != "left"]
            return [self._participant(item) for item in items]
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            raise GatewayError("waha response is not a participants list") from exc

    def own_jids(self) -> set[str]:
        """JIDs of the session's own account (best effort; empty, with a warning, when unknown)."""
        try:
            me = self._request("GET", f"/api/sessions/{_seg(self._session)}").json().get("me")
            jids = {normalize_jid(me.get(key)) for key in ("id", "lid")} - {""}
        except (GatewayError, ValueError, AttributeError) as exc:
            logger.warning(
                "WAHA session %r did not report its own account (%s); the bot account "
                "will not be excluded from roster syncs",
                self._session,
                exc,
            )
            return set()
        return jids

    def _participant(self, item: dict) -> Participant:
        jid = normalize_jid(item["id"])
        is_admin = item.get("role") in ADMIN_ROLES
        if not jid.endswith("@lid"):
            return Participant(jid, jid, None, "", is_admin)
        phone = _phone_jid(item.get("pn") or item.get("phoneNumber")) or self._phone_of(jid)
        return Participant(jid, phone or None, jid, "", is_admin)

    def _phone_of(self, lid: str) -> str:
        """Phone JID behind a LID (``GET /api/{session}/lids/{lid}``); '' when unknown."""
        try:
            data = self._request("GET", f"/api/{_seg(self._session)}/lids/{_seg(lid)}").json()
            return _phone_jid(data.get("pn") or data.get("phoneNumber"))
        except (GatewayError, ValueError, AttributeError):
            return ""
