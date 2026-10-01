from io import StringIO

import httpx
import pytest
import respx
from django.core.management import CommandError, call_command

from messaging.tests.waha_fixtures import FIXTURES
from messaging.waha.signature import verify_signature

URL = "http://localhost:8000/hooks/waha/"
FIXTURE = FIXTURES / "group_from_lid.json"


def replay(*args) -> str:
    out = StringIO()
    call_command("replay_waha", *args, stdout=out)
    return out.getvalue()


@respx.mock
def test_posts_the_sha512_signed_fixture_and_prints_status_and_body(settings):
    settings.WAHA_WEBHOOK_HMAC_KEY = "replay-key"
    route = respx.post(URL).mock(return_value=httpx.Response(200, json={"status": "accepted"}))
    output = replay(str(FIXTURE))
    request = route.calls.last.request
    assert request.content == FIXTURE.read_bytes()
    assert request.headers["content-type"] == "application/json"
    assert request.headers["x-webhook-hmac-algorithm"] == "sha512"
    assert verify_signature(request.content, request.headers["x-webhook-hmac"], "replay-key")
    assert "200" in output and '"status":"accepted"' in output


@respx.mock
def test_url_option(settings):
    settings.WAHA_WEBHOOK_HMAC_KEY = "replay-key"
    route = respx.post("https://viajecito.example/hooks/waha/").mock(
        return_value=httpx.Response(403, json={"code": "invalid_signature"})
    )
    output = replay(str(FIXTURE), "--url", "https://viajecito.example/hooks/waha/")
    assert route.called and "403" in output and "invalid_signature" in output


def test_requires_a_key(settings):
    settings.WAHA_WEBHOOK_HMAC_KEY = ""
    with pytest.raises(CommandError, match="WAHA_WEBHOOK_HMAC_KEY"):
        replay(str(FIXTURE))


def test_missing_fixture_is_a_command_error(settings):
    settings.WAHA_WEBHOOK_HMAC_KEY = "replay-key"
    with pytest.raises(CommandError, match="nope.json"):
        replay("nope.json")


@respx.mock
def test_unreachable_server_is_a_command_error(settings):
    settings.WAHA_WEBHOOK_HMAC_KEY = "replay-key"
    respx.post(URL).mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(CommandError, match="refused|ConnectError"):
        replay(str(FIXTURE))
