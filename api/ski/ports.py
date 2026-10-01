"""Ports of the ski app (pure; no Django, no HTTP). Adapters live in ``ski/adapters``."""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Protocol

from ski.domain import (
    GearInput,
    GearRecord,
    ManualReportInput,
    Participant,
    PassInput,
    PassRecord,
    ProfileInput,
    ProfileRecord,
    ReportData,
    ResortData,
    TripInfo,
    TripResortData,
)


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


class SkiStore(Protocol):
    """Persistence needed by the use cases behind the ski API and the bot."""

    def trip_info(self, trip_id: str) -> TripInfo | None: ...

    def trip_resorts(self, trip_id: str) -> list[TripResortData]: ...

    def latest_reports(self, resort_ids: list[str]) -> dict[str, ReportData]:
        """The newest report (by ``observed_at``) of each resort that has one."""
        ...

    def count_manual_reports(self, resort_id: str, since: datetime) -> int: ...

    def add_manual_report(
        self, resort_id: str, reporter_id: str, report: ManualReportInput, now: datetime
    ) -> ReportData: ...

    def list_resorts(self, country: str | None) -> list[ResortData]:
        """Active resorts, optionally of one country."""
        ...

    def get_resort(self, resort_id: str) -> ResortData | None:
        """An ACTIVE resort by id."""
        ...

    def add_trip_resort(self, trip_id: str, resort_id: str, nights: int | None) -> TripResortData:
        """Append the resort to the trip. Raises ``ResortAlreadyAddedError``."""
        ...

    def update_trip_resort(
        self, trip_id: str, resort_id: str, changes: dict[str, int | None]
    ) -> TripResortData | None:
        """Apply ``nights``/``position`` changes; ``None`` when the resort is not on the trip."""
        ...

    def remove_trip_resort(self, trip_id: str, resort_id: str) -> bool: ...

    def recent_reports(self, resort_id: str, limit: int) -> list[ReportData]:
        """Newest first."""
        ...

    def participants(self, trip_id: str) -> list[Participant]:
        """Every active member of the trip's crew with their RSVP, in a stable order."""
        ...

    def passes(self, trip_id: str) -> list[PassRecord]: ...

    def upsert_pass(self, trip_id: str, person_id: str, item: PassInput) -> PassRecord: ...

    def delete_pass(self, trip_id: str, person_id: str, resort_id: str | None) -> None: ...

    def gear(self, trip_id: str) -> list[GearRecord]: ...

    def replace_gear(
        self, trip_id: str, person_id: str, items: list[GearInput]
    ) -> list[GearRecord]: ...

    def profiles(self, person_ids: list[str]) -> list[ProfileRecord]: ...

    def get_profile(self, person_id: str) -> ProfileRecord | None: ...

    def save_profile(self, person_id: str, profile: ProfileInput) -> ProfileRecord: ...
