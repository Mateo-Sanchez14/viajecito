import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from ski.adapters.open_meteo import parse_forecast
from ski.ports import ProviderError

FIXTURES = Path(__file__).parent / "fixtures" / "open_meteo"
# 15:30 in Argentina (UTC-3) / 14:30 in Chile winter (UTC-4)
NOW = datetime(2026, 7, 15, 18, 30, tzinfo=UTC)


def load(name):
    return json.loads((FIXTURES / name).read_text())


def test_snowy_resort_converts_depth_to_cm_and_sums_the_last_24_hours():
    reading = parse_forecast(
        load("catedral_snowy.json"), timezone="America/Argentina/Salta", now=NOW
    )
    assert reading.observed_at == datetime(2026, 7, 15, 18, 0, tzinfo=UTC)
    assert reading.base_cm == 115  # 1.15 m
    # 24 hourly values ending at the observed hour: 1.5 + 4 * 1.0 + 0.7; the 9.0 cm hour is outside
    assert reading.new_24h_cm == Decimal("6.2")
    assert reading.temp_c == Decimal("-2.4")
    assert reading.elevation_m == 1565


def test_forecast_sums_the_three_days_after_today():
    reading = parse_forecast(
        load("catedral_snowy.json"), timezone="America/Argentina/Salta", now=NOW
    )
    assert reading.forecast_72h_cm == Decimal("18.7")  # 10.2 + 6.5 + 2.0, today's 5.0 excluded


def test_observed_hour_is_the_last_one_not_after_now_in_the_resort_timezone():
    reading = parse_forecast(load("valle_dry.json"), timezone="America/Santiago", now=NOW)
    assert reading.observed_at == datetime(2026, 7, 15, 18, 0, tzinfo=UTC)  # 14:00 at UTC-4
    assert reading.temp_c == Decimal("-6.2")


def test_dry_resort_reports_zeroes():
    reading = parse_forecast(load("valle_dry.json"), timezone="America/Santiago", now=NOW)
    assert reading.base_cm == 0
    assert reading.new_24h_cm == Decimal("0.0")
    assert reading.forecast_72h_cm == Decimal("0.0")


def test_null_values_become_none():
    payload = load("catedral_snowy.json")
    idx = payload["hourly"]["time"].index("2026-07-15T15:00")
    payload["hourly"]["snow_depth"][idx] = None
    payload["hourly"]["temperature_2m"][idx] = None
    reading = parse_forecast(payload, timezone="America/Argentina/Salta", now=NOW)
    assert reading.base_cm is None and reading.temp_c is None
    assert reading.new_24h_cm == Decimal("6.2")


def test_raw_is_trimmed():
    reading = parse_forecast(
        load("catedral_snowy.json"), timezone="America/Argentina/Salta", now=NOW
    )
    assert len(json.dumps(reading.raw)) < 32 * 1024
    assert len(reading.raw["hourly"]["time"]) == 24


def test_malformed_payload_raises_provider_error():
    with pytest.raises(ProviderError) as exc:
        parse_forecast(load("malformed.json"), timezone="America/Santiago", now=NOW)
    assert exc.value.reason == "malformed"


@pytest.mark.parametrize("payload", [[], {}, {"hourly": {}, "daily": {}}, "x", None])
def test_other_garbage_is_malformed(payload):
    with pytest.raises(ProviderError) as exc:
        parse_forecast(payload, timezone="America/Santiago", now=NOW)
    assert exc.value.reason == "malformed"


def test_now_before_the_first_hour_is_malformed():
    early = datetime(2026, 7, 1, tzinfo=UTC)
    with pytest.raises(ProviderError):
        parse_forecast(load("valle_dry.json"), timezone="America/Santiago", now=early)


def test_unexpected_depth_unit_is_malformed():
    payload = load("catedral_snowy.json")
    payload["hourly_units"]["snow_depth"] = "ft"
    with pytest.raises(ProviderError):
        parse_forecast(payload, timezone="America/Argentina/Salta", now=NOW)
