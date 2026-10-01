from io import StringIO

import httpx
import pytest
import respx
from django.core.management import CommandError, call_command

from messaging.gowa.signature import verify_signature
from messaging.tests.gowa_fixtures import FIXTURES

URL = "http://localhost:8000/hooks/gowa/"
FIXTURE = FIXTURES / "group_command_ping.json"


def replay(*args) -> str:
    out = StringIO()
    call_command("replay_gowa", *args, stdout=out)
    return out.getvalue()


@respx.mock
def test_posts_the_signed_fixture_and_prints_status_and_body(settings):
    settings.GOWA_WEBHOOK_SECRET = "replay-secret"
    route = respx.post(URL).mock(return_value=httpx.Response(200, json={"status": "accepted"}))
    output = replay(str(FIXTURE))
    request = route.calls.last.request
    assert request.content == FIXTURE.read_bytes()
    assert request.headers["content-type"] == "application/json"
    assert verify_signature(
        request.content, request.headers["x-hub-signature-256"], "replay-secret"
    )
    assert request.headers["x-hub-signature-256"].startswith("sha256=")
    assert "200" in output and '"status":"accepted"' in output


@respx.mock
def test_url_option(settings):
    settings.GOWA_WEBHOOK_SECRET = "replay-secret"
    route = respx.post("https://viajecito.example/hooks/gowa/").mock(
        return_value=httpx.Response(403, json={"code": "invalid_signature"})
    )
    output = replay(str(FIXTURE), "--url", "https://viajecito.example/hooks/gowa/")
    assert route.called and "403" in output and "invalid_signature" in output


def test_requires_a_secret(settings):
    settings.GOWA_WEBHOOK_SECRET = ""
    with pytest.raises(CommandError, match="GOWA_WEBHOOK_SECRET"):
        replay(str(FIXTURE))


def test_missing_fixture_is_a_command_error(settings):
    settings.GOWA_WEBHOOK_SECRET = "replay-secret"
    with pytest.raises(CommandError, match="nope.json"):
        replay("nope.json")


@respx.mock
def test_unreachable_server_is_a_command_error(settings):
    settings.GOWA_WEBHOOK_SECRET = "replay-secret"
    respx.post(URL).mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(CommandError, match="refused|ConnectError"):
        replay(str(FIXTURE))
