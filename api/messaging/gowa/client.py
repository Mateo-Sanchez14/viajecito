"""Thin synchronous client for Gowa (go-whatsapp-web-multidevice)."""

import httpx

from messaging.ports import GatewayError


class GowaClient:
    """Sends text through ``POST {base_url}/send/message`` with optional Basic auth."""

    def __init__(
        self,
        base_url: str,
        basic_auth_user: str = "",
        basic_auth_pass: str = "",
        timeout: float = 10,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._auth = (basic_auth_user, basic_auth_pass) if basic_auth_user else None
        self._timeout = timeout

    def send_text(self, to_jid: str, body: str, reply_to: str | None = None) -> str:
        payload: dict[str, str] = {"phone": to_jid, "message": body}
        if reply_to:
            payload["reply_message_id"] = reply_to
        try:
            response = httpx.post(
                f"{self._base_url}/send/message",
                json=payload,
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
