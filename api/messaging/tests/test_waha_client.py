"""WahaClient against the endpoints in the WAHA docs (how-to/send-messages, how-to/groups,
how-to/contacts); HTTP is mocked."""

import json

import httpx
import pytest
import respx

from messaging.ports import GatewayError
from messaging.waha.client import WahaClient

BASE = "http://waha.test"
GROUP = "120363000000000000@g.us"
SENT = {"id": "true_5491100000001@c.us_3EB0AAAA", "fromMe": True, "body": "hola"}


@pytest.fixture
def client():
    return WahaClient(BASE, "k3y", session="default", timeout=3)


@respx.mock
def test_send_text_posts_to_send_text_with_api_key_and_returns_the_id(client):
    route = respx.post(f"{BASE}/api/sendText").mock(return_value=httpx.Response(201, json=SENT))
    assert client.send_text("5491100000001@s.whatsapp.net", "hola") == "3EB0AAAA"
    request = route.calls.last.request
    assert request.headers["x-api-key"] == "k3y"
    assert json.loads(request.content) == {
        "session": "default",
        "chatId": "5491100000001@c.us",
        "text": "hola",
    }


@respx.mock
def test_group_chat_ids_are_untouched_and_reply_to_is_sent(client):
    route = respx.post(f"{BASE}/api/sendText").mock(return_value=httpx.Response(201, json=SENT))
    client.send_text(GROUP, "ok", reply_to="false_x@g.us_MSG1")
    assert json.loads(route.calls.last.request.content) == {
        "session": "default",
        "chatId": GROUP,
        "text": "ok",
        "reply_to": "false_x@g.us_MSG1",
    }


@respx.mock
def test_mentions_are_sent_as_c_us_ids(client):
    route = respx.post(f"{BASE}/api/sendText").mock(return_value=httpx.Response(201, json=SENT))
    client.send_text(GROUP, "hola @5491100000001", mentions=["5491100000001@s.whatsapp.net"])
    assert json.loads(route.calls.last.request.content)["mentions"] == ["5491100000001@c.us"]


@respx.mock
def test_no_api_key_header_when_empty():
    route = respx.post(f"{BASE}/api/sendText").mock(return_value=httpx.Response(201, json=SENT))
    WahaClient(BASE, "").send_text(GROUP, "x")
    assert "x-api-key" not in route.calls.last.request.headers


@respx.mock
@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(401, json={"message": "Unauthorized"}),
        httpx.Response(201, json={}),
        httpx.Response(201, json={"id": ""}),
        httpx.Response(201, text="not json"),
    ],
)
def test_send_text_failures_raise_gateway_error(client, response):
    respx.post(f"{BASE}/api/sendText").mock(return_value=response)
    with pytest.raises(GatewayError):
        client.send_text(GROUP, "x")


@respx.mock
def test_send_text_accepts_a_serialized_id_object(client):
    body = {"id": {"_serialized": "true_g_ABC", "id": "ABC"}}
    respx.post(f"{BASE}/api/sendText").mock(return_value=httpx.Response(201, json=body))
    assert client.send_text(GROUP, "x") == "true_g_ABC"


@respx.mock
def test_network_error_raises_gateway_error(client):
    respx.post(f"{BASE}/api/sendText").mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(GatewayError, match="ConnectError"):
        client.send_text(GROUP, "x")


@respx.mock
def test_group_participants_maps_c_us_roles_and_resolves_lids(client):
    respx.get(f"{BASE}/api/default/groups/{GROUP}/participants/v2").mock(
        return_value=httpx.Response(
            200,
            json=[
                {"id": "5491100000001@c.us", "role": "superadmin"},
                {"id": "251556000000002@lid", "role": "participant"},
                {"id": "251556000000003@lid", "role": "participant"},
                {"id": "5491100000004@c.us", "role": "left"},
            ],
        )
    )
    respx.get(f"{BASE}/api/default/lids/251556000000002@lid").mock(
        return_value=httpx.Response(
            200, json={"lid": "251556000000002@lid", "pn": "5491100000002@c.us"}
        )
    )
    respx.get(f"{BASE}/api/default/lids/251556000000003@lid").mock(
        return_value=httpx.Response(200, json={"lid": "251556000000003@lid", "pn": None})
    )
    ana, beto, gus = client.group_participants(GROUP)
    assert (ana.jid, ana.phone_number, ana.lid, ana.is_admin) == (
        "5491100000001@s.whatsapp.net",
        "5491100000001@s.whatsapp.net",
        None,
        True,
    )
    assert (beto.jid, beto.phone_number, beto.lid, beto.is_admin) == (
        "251556000000002@lid",
        "5491100000002@s.whatsapp.net",
        "251556000000002@lid",
        False,
    )
    assert (gus.jid, gus.phone_number, gus.lid) == (
        "251556000000003@lid",
        None,
        "251556000000003@lid",
    )


@respx.mock
def test_lid_lookup_accepts_phone_number_field_and_survives_failures(client):
    respx.get(f"{BASE}/api/default/groups/{GROUP}/participants/v2").mock(
        return_value=httpx.Response(
            200,
            json=[
                {"id": "1@lid", "role": "participant"},
                {"id": "2@lid", "role": "participant"},
            ],
        )
    )
    respx.get(f"{BASE}/api/default/lids/1@lid").mock(
        return_value=httpx.Response(200, json={"phoneNumber": "5491100000001"})
    )
    respx.get(f"{BASE}/api/default/lids/2@lid").mock(return_value=httpx.Response(404))
    one, two = client.group_participants(GROUP)
    assert one.phone_number == "5491100000001@s.whatsapp.net" and two.phone_number is None


@respx.mock
def test_bare_digit_pn_becomes_a_phone_jid(client):
    respx.get(f"{BASE}/api/default/groups/{GROUP}/participants/v2").mock(
        return_value=httpx.Response(200, json=[{"id": "1@lid", "pn": "5491100000001"}])
    )
    (one,) = client.group_participants(GROUP)
    assert one.phone_number == "5491100000001@s.whatsapp.net"


@respx.mock
def test_participants_prefers_inline_pn_over_a_lookup(client):
    respx.get(f"{BASE}/api/default/groups/{GROUP}/participants/v2").mock(
        return_value=httpx.Response(
            200, json=[{"id": "1@lid", "pn": "5491100000001@c.us", "role": "participant"}]
        )
    )
    (one,) = client.group_participants(GROUP)  # no lids route mocked: a lookup would raise
    assert one.phone_number == "5491100000001@s.whatsapp.net"


@respx.mock
@pytest.mark.parametrize(
    "response",
    [httpx.Response(404), httpx.Response(200, json={"oops": 1}), httpx.Response(200, text="x")],
)
def test_group_participants_failures_raise_gateway_error(client, response):
    respx.get(f"{BASE}/api/default/groups/{GROUP}/participants/v2").mock(return_value=response)
    with pytest.raises(GatewayError):
        client.group_participants(GROUP)


@respx.mock
def test_own_jid_reads_the_session_me(client):
    route = respx.get(f"{BASE}/api/sessions/default").mock(
        return_value=httpx.Response(
            200, json={"name": "default", "me": {"id": "5491100000009:5@c.us", "lid": "9@lid"}}
        )
    )
    assert client.own_jids() == {"5491100000009@s.whatsapp.net", "9@lid"}
    assert route.calls.last.request.headers["x-api-key"] == "k3y"


@respx.mock
def test_own_jids_is_empty_and_warns_when_unavailable(client, caplog):
    respx.get(f"{BASE}/api/sessions/default").mock(return_value=httpx.Response(500))
    with caplog.at_level("WARNING"):
        assert client.own_jids() == set()
    assert "bot account will not be excluded" in caplog.text


@respx.mock
def test_own_jids_warns_when_the_session_has_no_me(client, caplog):
    respx.get(f"{BASE}/api/sessions/default").mock(
        return_value=httpx.Response(200, json={"name": "default", "me": None})
    )
    with caplog.at_level("WARNING"):
        assert client.own_jids() == set()
    assert "bot account will not be excluded" in caplog.text


@respx.mock
def test_jids_are_percent_encoded_in_paths(client):
    groups = respx.get(url__startswith=f"{BASE}/api/default/groups/").mock(
        return_value=httpx.Response(200, json=[{"id": "1@lid", "role": "participant"}])
    )
    lids = respx.get(url__startswith=f"{BASE}/api/default/lids/").mock(
        return_value=httpx.Response(200, json={"pn": "5491100000001@c.us"})
    )
    client.group_participants(GROUP)
    assert groups.calls.last.request.url.raw_path.startswith(
        b"/api/default/groups/120363000000000000%40g.us/participants/v2"
    )
    assert lids.calls.last.request.url.raw_path == b"/api/default/lids/1%40lid"
