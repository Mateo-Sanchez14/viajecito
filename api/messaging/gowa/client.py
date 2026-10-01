"""Thin synchronous client for Gowa (go-whatsapp-web-multidevice)."""

from collections.abc import Sequence
from typing import Any

import httpx

from messaging.ports import GatewayError, Participant


class GowaClient:
    """Talks to Gowa with optional Basic auth and an optional ``X-Device-Id`` header."""

    def __init__(
        self,
        base_url: str,
        basic_auth_user: str = "",
        basic_auth_pass: str = "",
        timeout: float = 10,
        device_id: str = "",
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._auth = (basic_auth_user, basic_auth_pass) if basic_auth_user else None
        self._timeout = timeout
        self._headers = {"X-Device-Id": device_id} if device_id else {}

    def send_text(
        self,
        to_jid: str,
        body: str,
        reply_to: str | None = None,
        mentions: Sequence[str] = (),
    ) -> str:
        payload: dict[str, Any] = {"phone": to_jid, "message": body}
        if reply_to:
            payload["reply_message_id"] = reply_to
        if mentions:
            # TODO: confirm Gowa's field name for @-mentions (``mentions`` is a guess); the caller
            # only passes JIDs when GOWA_MENTIONS_ENABLED is on, so the default path is unaffected.
            payload["mentions"] = list(mentions)
        try:
            response = httpx.post(
                f"{self._base_url}/send/message",
                json=payload,
                headers=self._headers,
                auth=self._auth,
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise GatewayError(f"gowa request failed: {exc.__class__.__name__}") from exc
        if response.status_code >= 400:
            raise GatewayError(f"gowa responded with HTTP {response.status_code}")
        try:
            message_id = response.json()["results"]["message_id"]
        except (ValueError, KeyError, TypeError) as exc:
            raise GatewayError("gowa response has no results.message_id") from exc
        if not message_id:
            raise GatewayError("gowa response has an empty results.message_id")
        return str(message_id)

    def group_participants(self, chat_id: str) -> list[Participant]:
        """Members of a group through ``GET {base_url}/group/participants?group_id=``."""
        try:
            response = httpx.get(
                f"{self._base_url}/group/participants",
                params={"group_id": chat_id},
                headers=self._headers,
                auth=self._auth,
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise GatewayError(f"gowa request failed: {exc.__class__.__name__}") from exc
        if response.status_code >= 400:
            raise GatewayError(f"gowa responded with HTTP {response.status_code}")
        try:
            items = response.json()["results"]["participants"]
            return [_participant(item) for item in items]
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            raise GatewayError("gowa response has no results.participants") from exc


def _participant(item: dict) -> Participant:
    return Participant(
        jid=item["jid"],
        phone_number=item.get("phone_number") or None,
        lid=item.get("lid") or None,
        display_name=item.get("display_name") or "",
        is_admin=bool(item.get("is_admin") or item.get("is_super_admin")),
    )
