"""Plain data the proposals use cases exchange with their store (pure)."""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal


@dataclass(frozen=True)
class TripRef:
    id: str
    crew_id: str
    currency: str
    status: str


@dataclass(frozen=True)
class PreviewSummary:
    id: str
    url: str
    final_url: str
    canonical_url: str
    site_name: str
    title: str
    description: str
    image_url: str
    has_thumbnail: bool
    price_amount: Decimal | None
    price_currency: str
    lat: float | None
    lng: float | None
    fetch_status: str
    fetched_at: datetime | None


@dataclass(frozen=True)
class ProposalRecord:
    id: str
    trip_id: str
    crew_id: str
    author_id: str
    category: str
    status: str
    title: str
    note: str
    canonical_url: str | None
    est_price: Decimal | None
    price_basis: str
    currency: str
    starts_on: date | None
    ends_on: date | None
    booking_ref: str
    chosen_at: datetime | None
    booked_at: datetime | None
    discarded_at: datetime | None
    classified_by: str
    source_message_id: int | None
    created_at: datetime
    updated_at: datetime
    preview: PreviewSummary | None
    comment_count: int

    @property
    def web_path(self) -> str:
        return f"/crews/{self.crew_id}/trips/{self.trip_id}/proposals/{self.id}"


@dataclass(frozen=True)
class CommentRecord:
    id: str
    proposal_id: str
    author_id: str
    body: str
    source_message_id: int | None
    created_at: datetime


@dataclass(frozen=True)
class NewProposal:
    """Every resolved field of a proposal about to be created."""

    trip_id: str
    author_id: str
    title: str
    category: str
    classified_by: str
    note: str = ""
    link_preview_id: str | None = None
    canonical_url: str | None = None
    est_price: Decimal | None = None
    price_basis: str = "total"
    currency: str = "USD"
    starts_on: date | None = None
    ends_on: date | None = None
    source_message_id: int | None = None
