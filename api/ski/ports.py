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


@dataclass(frozen=True)
class FetchState:
    consecutive_failures: int = 0
    last_success_at: datetime | None = None
    next_attempt_at: datetime | None = None


@dataclass(frozen=True)
class RefreshCandidate:
    resort: ResortRef
    state: FetchState


class SnowRefreshStore(Protocol):
    """Persistence needed by the snow refresh job."""

    def eligible_resorts(self, now: datetime) -> list[RefreshCandidate]:
        """Active provider-backed resorts linked to trips that are planning/booked/ongoing and not
        ended more than a day ago, with their fetch bookkeeping."""
        ...

    def record_success(self, resort_id: str, reading: SnowReading, now: datetime) -> None: ...

    def record_failure(
        self, resort_id: str, reason: str, now: datetime, next_attempt_at: datetime, failures: int
    ) -> None: ...

    def set_next_attempt(
        self, resort_id: str, now: datetime, next_attempt_at: datetime
    ) -> None: ...

    def prune_provider_reports(self, before: datetime) -> int:
        """Delete provider-sourced (never manual) reports observed before ``before``."""
        ...
