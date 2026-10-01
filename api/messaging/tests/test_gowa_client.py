import base64
import json

import httpx
import pytest
import respx

from messaging.gowa.client import GowaClient
from messaging.ports import GatewayError

BASE = "http://gowa.test"
OK = {
    "code": "SUCCESS",
    "message": "Message sent",
    "results": {"message_id": "ABC123", "status": "sent"},
}


@pytest.fixture
def client():
    return GowaClient(BASE, "bot", "s3cret", timeout=3)


@respx.mock
def test_send_text_posts_payload_and_returns_message_id(client):
    route = respx.post(f"{BASE}/send/message").mock(return_value=httpx.Response(200, json=OK))
    assert client.send_text("5491155551234@s.whatsapp.net", "hola") == "ABC123"
    sent = route.calls.last.request
    assert json.loads(sent.content) == {"phone": "5491155551234@s.whatsapp.net", "message": "hola"}


@respx.mock
def test_send_text_includes_reply_message_id(client):
    route = respx.post(f"{BASE}/send/message").mock(return_value=httpx.Response(200, json=OK))
    client.send_text("1203@g.us", "ok", reply_to="MSG1")
    assert json.loads(route.calls.last.request.content)["reply_message_id"] == "MSG1"


@respx.mock
def test_send_text_uses_basic_auth(client):
    route = respx.post(f"{BASE}/send/message").mock(return_value=httpx.Response(200, json=OK))
    client.send_text("1@s.whatsapp.net", "hola")
    expected = "Basic " + base64.b64encode(b"bot:s3cret").decode()
    assert route.calls.last.request.headers["authorization"] == expected


@respx.mock
def test_no_auth_header_without_credentials():
    route = respx.post(f"{BASE}/send/message").mock(return_value=httpx.Response(200, json=OK))
    GowaClient(BASE, "", "").send_text("1@s.whatsapp.net", "hola")
    assert "authorization" not in route.calls.last.request.headers


@respx.mock
def test_trailing_slash_in_base_url_is_tolerated():
    route = respx.post(f"{BASE}/send/message").mock(return_value=httpx.Response(200, json=OK))
    GowaClient(BASE + "/", "", "").send_text("1@s.whatsapp.net", "hola")
    assert route.called


@respx.mock
def test_http_error_raises_gateway_error(client):
    respx.post(f"{BASE}/send/message").mock(return_value=httpx.Response(500, text="boom"))
    with pytest.raises(GatewayError, match="500"):
        client.send_text("1@s.whatsapp.net", "hola")


@respx.mock
def test_network_error_raises_gateway_error(client):
    respx.post(f"{BASE}/send/message").mock(side_effect=httpx.ConnectTimeout("slow"))
    with pytest.raises(GatewayError):
        client.send_text("1@s.whatsapp.net", "hola")


@respx.mock
def test_missing_message_id_raises_gateway_error(client):
    respx.post(f"{BASE}/send/message").mock(
        return_value=httpx.Response(200, json={"code": "SUCCESS", "results": {}})
    )
    with pytest.raises(GatewayError, match="message_id"):
        client.send_text("1@s.whatsapp.net", "hola")


@respx.mock
def test_non_json_body_raises_gateway_error(client):
    respx.post(f"{BASE}/send/message").mock(return_value=httpx.Response(200, text="<html>"))
    with pytest.raises(GatewayError):
        client.send_text("1@s.whatsapp.net", "hola")
