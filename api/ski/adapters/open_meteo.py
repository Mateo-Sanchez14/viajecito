"""Open-Meteo adapter of the ``SnowReportProvider`` port (no API key).

Docs: https://open-meteo.com/en/docs (``hourly=snowfall,snow_depth,temperature_2m`` in cm/h, m and
degrees C; ``daily=snowfall_sum`` in cm; ``elevation`` selects the grid cell; ``timezone`` makes the
timestamps local and naive ISO 8601).
"""

import json
import time
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta, timezone, tzinfo
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from ski.ports import ProviderError, ResortRef, SnowReading

BASE_URL = "https://api.open-meteo.com/v1/forecast"  # fixed host: never built from user input
TOTAL_SECONDS = 10.0  # deadline for the whole call, body included
TIMEOUT = httpx.Timeout(TOTAL_SECONDS, connect=5.0)  # per-operation limits inside it
MAX_RESPONSE_BYTES = 512 * 1024

RAW_MAX_BYTES = 32 * 1024
_TENTH = Decimal("0.1")
_DEPTH_TO_CM = {"m": Decimal(100), "cm": Decimal(1)}


def _malformed() -> ProviderError:
    return ProviderError("malformed")


def _number(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise _malformed()
    return Decimal(str(value))


def _series(block: dict, key: str, length: int) -> list[Decimal | None]:
    values = block.get(key)
    if not isinstance(values, list) or len(values) != length:
        raise _malformed()
    return [_number(v) for v in values]


def _tenths(values: list[Decimal | None]) -> Decimal | None:
    present = [v for v in values if v is not None]
    if not present:
        return None
    return sum(present, Decimal(0)).quantize(_TENTH, rounding=ROUND_HALF_UP)


def _zone(payload: dict, fallback: str) -> tzinfo:
    """The response's own constant UTC offset (``utc_offset_seconds``); the named zone only when it
    is missing. tzdata would shift hours after a DST change inside the response window."""
    offset = payload.get("utc_offset_seconds")
    if isinstance(offset, int) and not isinstance(offset, bool) and abs(offset) < 86400:
        return timezone(timedelta(seconds=offset))
    return ZoneInfo(fallback)


def _local_time(text: Any, zone: tzinfo) -> datetime:
    if not isinstance(text, str):
        raise _malformed()
    try:
        return datetime.fromisoformat(text).replace(tzinfo=zone).astimezone(UTC)
    except ValueError as exc:
        raise _malformed() from exc


def parse_forecast(payload: Any, *, timezone: str, now: datetime) -> SnowReading:
    """Turn an Open-Meteo forecast response into a ``SnowReading``; ``ProviderError("malformed")``
    when the shape or the units are not what we asked for."""
    from ski.ports import SnowReading

    if not isinstance(payload, dict):
        raise _malformed()
    hourly, daily = payload.get("hourly"), payload.get("daily")
    if not isinstance(hourly, dict) or not isinstance(daily, dict):
        raise _malformed()
    zone = _zone(payload, timezone)
    times = hourly.get("time")
    if not isinstance(times, list) or not times:
        raise _malformed()
    stamps = [_local_time(t, zone) for t in times]
    snowfall = _series(hourly, "snowfall", len(times))
    depth = _series(hourly, "snow_depth", len(times))
    temperature = _series(hourly, "temperature_2m", len(times))

    units = payload.get("hourly_units")
    depth_unit = units.get("snow_depth", "m") if isinstance(units, dict) else "m"
    if depth_unit not in _DEPTH_TO_CM:
        raise _malformed()

    observed = max((i for i, t in enumerate(stamps) if t <= now), default=None)
    if observed is None:
        raise _malformed()
    window = slice(max(observed - 23, 0), observed + 1)
    new_24h = _tenths(snowfall[window]) if observed >= 23 else None

    base_cm = None
    if depth[observed] is not None:
        base_cm = max(int((depth[observed] * _DEPTH_TO_CM[depth_unit]).to_integral_value()), 0)
    temp = temperature[observed]

    forecast = _forecast_72h(daily, now.astimezone(zone).date())
    elevation = payload.get("elevation")
    return SnowReading(
        observed_at=stamps[observed],
        elevation_m=round(elevation) if isinstance(elevation, int | float) else None,
        base_cm=base_cm,
        new_24h_cm=new_24h,
        forecast_72h_cm=forecast,
        temp_c=None if temp is None else temp.quantize(_TENTH, rounding=ROUND_HALF_UP),
        raw=_trim_raw(payload, window),
    )


def _forecast_72h(daily: dict, today: date) -> Decimal | None:
    days = daily.get("time")
    if not isinstance(days, list):
        raise _malformed()
    sums = _series(daily, "snowfall_sum", len(days))
    wanted = {today + timedelta(days=n) for n in (1, 2, 3)}
    chosen: list[Decimal | None] = []
    for text, value in zip(days, sums, strict=True):
        try:
            if date.fromisoformat(text) in wanted:
                chosen.append(value)
        except (TypeError, ValueError) as exc:
            raise _malformed() from exc
    return _tenths(chosen)


def _trim_raw(payload: dict, window: slice) -> dict:
    hourly = payload["hourly"]
    raw = {
        "elevation": payload.get("elevation"),
        "utc_offset_seconds": payload.get("utc_offset_seconds"),
        "hourly_units": payload.get("hourly_units"),
        "daily_units": payload.get("daily_units"),
        "hourly": {
            key: values[window] for key, values in hourly.items() if isinstance(values, list)
        },
        "daily": payload["daily"],
    }
    if len(json.dumps(raw)) > RAW_MAX_BYTES:
        raw = {"elevation": payload.get("elevation"), "truncated": True}
    return raw


class OpenMeteoProvider:
    """``SnowReportProvider`` backed by the free Open-Meteo forecast API. One call per fetch,
    no retries (the refresh job owns backoff), and a 10 s deadline for the whole call."""

    def __init__(self, monotonic: Callable[[], float] = time.monotonic) -> None:
        self._monotonic = monotonic

    def fetch(self, resort: ResortRef, now: datetime) -> SnowReading:
        params = {
            "latitude": str(resort.lat),
            "longitude": str(resort.lng),
            "elevation": str(round((resort.base_elev_m + resort.summit_elev_m) / 2)),
            "hourly": "snowfall,snow_depth,temperature_2m",
            "daily": "snowfall_sum",
            "past_days": "1",
            "forecast_days": "4",  # today + the 3 days the 72 h forecast sums
            "timezone": resort.timezone,
        }
        body = self._get(params)
        try:
            payload = json.loads(body)
        except ValueError as exc:
            raise ProviderError("malformed") from exc
        return parse_forecast(payload, timezone=resort.timezone, now=now)

    def _get(self, params: dict[str, str]) -> bytes:
        deadline = self._monotonic() + TOTAL_SECONDS
        try:
            with httpx.Client(timeout=TIMEOUT) as client:
                with client.stream("GET", BASE_URL, params=params) as response:
                    if response.status_code != 200:
                        raise ProviderError(f"http_{response.status_code}")
                    body = bytearray()
                    for chunk in response.iter_bytes():
                        body += chunk
                        if len(body) > MAX_RESPONSE_BYTES:
                            raise ProviderError("too_large")
                        if self._monotonic() > deadline:  # httpx timeouts reset on every chunk
                            raise ProviderError("timeout")
                    return bytes(body)
        except httpx.TimeoutException as exc:
            raise ProviderError("timeout") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("network") from exc
