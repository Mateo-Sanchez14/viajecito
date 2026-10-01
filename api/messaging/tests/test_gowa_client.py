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


PARTICIPANTS = {
    "code": "SUCCESS",
    "message": "Success getting group participants",
    "results": {
        "group_id": "120363000000000000@g.us",
        "name": "Los Pibes",
        "participants": [
            {
                "jid": "251556000000001@lid",
                "phone_number": "5491100000001@s.whatsapp.net",
                "lid": "251556000000001@lid",
                "display_name": "Ana",
                "is_admin": True,
                "is_super_admin": False,
            },
            {"jid": "5491100000002@s.whatsapp.net", "lid": None, "display_name": None},
        ],
    },
}


@respx.mock
def test_group_participants_gets_the_roster(client):
    route = respx.get(f"{BASE}/group/participants").mock(
        return_value=httpx.Response(200, json=PARTICIPANTS)
    )
    people = client.group_participants("120363000000000000@g.us")
    request = route.calls.last.request
    assert request.url.params["group_id"] == "120363000000000000@g.us"
    assert request.headers["authorization"].startswith("Basic ")
    assert [(p.jid, p.phone_number, p.lid, p.display_name, p.is_admin) for p in people] == [
        (
            "251556000000001@lid",
            "5491100000001@s.whatsapp.net",
            "251556000000001@lid",
            "Ana",
            True,
        ),
        ("5491100000002@s.whatsapp.net", None, None, "", False),
    ]


@respx.mock
def test_device_id_is_sent_as_header_when_configured():
    route = respx.get(f"{BASE}/group/participants").mock(
        return_value=httpx.Response(200, json=PARTICIPANTS)
    )
    GowaClient(BASE, device_id="5491100000009@s.whatsapp.net").group_participants("g@g.us")
    assert route.calls.last.request.headers["x-device-id"] == "5491100000009@s.whatsapp.net"


@respx.mock
def test_device_id_header_is_also_sent_with_messages():
    route = respx.post(f"{BASE}/send/message").mock(return_value=httpx.Response(200, json=OK))
    GowaClient(BASE, device_id="dev-1").send_text("5491155551234@s.whatsapp.net", "hola")
    assert route.calls.last.request.headers["x-device-id"] == "dev-1"


@respx.mock
def test_group_participants_http_error_raises_gateway_error(client):
    respx.get(f"{BASE}/group/participants").mock(return_value=httpx.Response(500))
    with pytest.raises(GatewayError, match="500"):
        client.group_participants("g@g.us")


@respx.mock
def test_group_participants_malformed_body_raises_gateway_error(client):
    respx.get(f"{BASE}/group/participants").mock(return_value=httpx.Response(200, json={"x": 1}))
    with pytest.raises(GatewayError, match="participants"):
        client.group_participants("g@g.us")


@respx.mock
def test_group_participants_network_error_raises_gateway_error(client):
    respx.get(f"{BASE}/group/participants").mock(side_effect=httpx.ConnectError("boom"))
    with pytest.raises(GatewayError):
        client.group_participants("g@g.us")
