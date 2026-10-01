"""Ports of the ski app (pure; no Django, no HTTP). Adapters live in ``ski/adapters``."""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Protocol


class ProviderError(Exception):
    """A snow provider could not deliver a reading. ``reason`` is a short code
    (``http_503``, ``malformed``, ``timeout``, ``too_large``, ``network``)."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class ResortRef:
    """What a provider needs to know about a resort."""

    id: str
    slug: str
    name: str
    lat: float
    lng: float
    base_elev_m: int
    summit_elev_m: int
    timezone: str
    provider_ref: str = ""


@dataclass(frozen=True)
class SnowReading:
    observed_at: datetime  # aware UTC
    elevation_m: int | None
    base_cm: int | None
    new_24h_cm: Decimal | None
    forecast_72h_cm: Decimal | None
    temp_c: Decimal | None
    raw: dict[str, Any] = field(default_factory=dict)


class SnowReportProvider(Protocol):
    def fetch(self, resort: ResortRef, now: datetime) -> SnowReading:
        """Current conditions for the resort. Raises ``ProviderError``; never retries."""
        ...
