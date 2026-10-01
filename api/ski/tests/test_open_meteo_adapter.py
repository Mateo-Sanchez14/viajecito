import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
import respx

from ski.adapters.open_meteo import MAX_RESPONSE_BYTES, OpenMeteoProvider
from ski.ports import ProviderError, ResortRef

FIXTURE = Path(__file__).parent / "fixtures" / "open_meteo" / "catedral_snowy.json"
NOW = datetime(2026, 7, 15, 18, 30, tzinfo=UTC)
URL = "https://api.open-meteo.com/v1/forecast"

CATEDRAL = ResortRef(
    id="r1",
    slug="cerro-catedral",
    name="Cerro Catedral",
    lat=-41.17,
    lng=-71.44,
    base_elev_m=1030,
    summit_elev_m=2100,
    timezone="America/Argentina/Salta",
)


@pytest.fixture
def mock():
    with respx.mock(assert_all_called=False) as router:
        yield router


def test_requests_the_documented_parameters_including_mid_elevation(mock):
    route = mock.get(URL).respond(200, json=json.loads(FIXTURE.read_text()))
    reading = OpenMeteoProvider().fetch(CATEDRAL, NOW)
    assert route.call_count == 1
    params = dict(route.calls[0].request.url.params)
    assert params == {
        "latitude": "-41.17",
        "longitude": "-71.44",
        "elevation": "1565",  # round((1030 + 2100) / 2)
        "hourly": "snowfall,snow_depth,temperature_2m",
        "daily": "snowfall_sum",
        "past_days": "1",
        "forecast_days": "4",
        "timezone": "America/Argentina/Salta",
    }
    assert reading.base_cm == 115


def test_sends_no_credentials(mock):
    route = mock.get(URL).respond(200, json=json.loads(FIXTURE.read_text()))
    OpenMeteoProvider().fetch(CATEDRAL, NOW)
    headers = route.calls[0].request.headers
    assert "authorization" not in headers and "apikey" not in route.calls[0].request.url.params


def test_uses_5s_connect_and_10s_total_timeouts(mock, monkeypatch):
    seen = {}
    real = httpx.Client

    def spy(*args, **kwargs):
        seen.update(kwargs)
        return real(*args, **kwargs)

    monkeypatch.setattr("ski.adapters.open_meteo.httpx.Client", spy)
    mock.get(URL).respond(200, json=json.loads(FIXTURE.read_text()))
    OpenMeteoProvider().fetch(CATEDRAL, NOW)
    timeout = seen["timeout"]
    assert (timeout.connect, timeout.read, timeout.write, timeout.pool) == (5, 10, 10, 10)


@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (httpx.ConnectTimeout("slow"), "timeout"),
        (httpx.ReadTimeout("slow"), "timeout"),
        (httpx.ConnectError("down"), "network"),
    ],
)
def test_transport_errors_become_provider_errors(mock, error, reason):
    route = mock.get(URL).mock(side_effect=error)
    with pytest.raises(ProviderError) as exc:
        OpenMeteoProvider().fetch(CATEDRAL, NOW)
    assert exc.value.reason == reason
    assert route.call_count == 1  # no in-request retries


@pytest.mark.parametrize("status", [429, 500, 503])
def test_non_200_is_http_status(mock, status):
    mock.get(URL).respond(status, json={"error": True})
    with pytest.raises(ProviderError) as exc:
        OpenMeteoProvider().fetch(CATEDRAL, NOW)
    assert exc.value.reason == f"http_{status}"


def test_invalid_json_is_malformed(mock):
    mock.get(URL).respond(200, content=b"<html>nope</html>")
    with pytest.raises(ProviderError) as exc:
        OpenMeteoProvider().fetch(CATEDRAL, NOW)
    assert exc.value.reason == "malformed"


def test_oversized_response_is_rejected(mock):
    mock.get(URL).respond(200, content=b" " * (MAX_RESPONSE_BYTES + 1))
    with pytest.raises(ProviderError) as exc:
        OpenMeteoProvider().fetch(CATEDRAL, NOW)
    assert exc.value.reason == "too_large"


def test_oversized_chunked_response_is_rejected_while_streaming(mock):
    def chunks():
        for _ in range(MAX_RESPONSE_BYTES // 1024 + 2):
            yield b" " * 1024

    mock.get(URL).respond(200, content=chunks())
    with pytest.raises(ProviderError) as exc:
        OpenMeteoProvider().fetch(CATEDRAL, NOW)
    assert exc.value.reason == "too_large"
