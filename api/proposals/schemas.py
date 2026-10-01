from datetime import date, datetime
from typing import Literal
from uuid import UUID

from ninja import Field, Schema

from shared.api_errors import ErrorOut

Category = Literal["lodging", "transport", "activity", "food", "gear", "destination", "other"]
Status = Literal["proposed", "discussing", "chosen", "booked", "discarded"]
PriceBasis = Literal["total", "per_person", "per_night"]
Source = Literal["whatsapp", "web"]
FetchStatus = Literal["pending", "ok", "partial", "blocked", "failed"]
VoteValue = Literal[-1, 0, 1]


# --- input ------------------------------------------------------------------------------------


class ProposalCreateIn(Schema):
    """``url`` or ``title`` is required (checked in the endpoint: ``400 invalid_request``)."""

    url: str | None = Field(None, max_length=10_000)
    title: str | None = Field(None, max_length=300)
    category: Category | None = None
    note: str | None = Field(None, max_length=2000)
    est_price: str | None = Field(None, max_length=40)
    currency: str | None = Field(None, max_length=8)
    price_basis: PriceBasis | None = None
    starts_on: date | None = None
    ends_on: date | None = None


class ProposalPatchIn(Schema):
    """Every field optional; only those sent are applied. ``null`` clears ``est_price``, the dates
    and ``booking_ref``."""

    title: str | None = Field(None, max_length=300)
    note: str | None = Field(None, max_length=2000)
    category: Category | None = None
    est_price: str | None = Field(None, max_length=40)
    currency: str | None = Field(None, max_length=8)
    price_basis: PriceBasis | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    booking_ref: str | None = Field(None, max_length=120)


class TransitionIn(Schema):
    to: Status
    booking_ref: str | None = Field(None, max_length=120)


class VoteIn(Schema):
    value: VoteValue


class CommentIn(Schema):
    body: str = Field(max_length=10_000)


# --- output (no defaults: every field is always present, so the TS types are required) ----------


class LinkPreviewOut(Schema):
    url: str
    final_url: str
    site_name: str
    title: str
    description: str
    image_url: str
    has_thumbnail: bool
    price_amount: str | None
    price_currency: str
    lat: float | None
    lng: float | None
    fetch_status: FetchStatus
    fetched_at: datetime | None


class VoteTallyOut(Schema):
    up: int
    neutral: int
    down: int
    score: int
    my_vote: VoteValue | None
    majority: bool


class PersonRefOut(Schema):
    person_id: UUID
    display_name: str


class VoteOut(Schema):
    person: PersonRefOut
    value: VoteValue


class ProposalSummaryOut(Schema):
    id: UUID
    trip_id: UUID
    category: Category
    status: Status
    title: str
    note: str
    author: PersonRefOut
    est_price: str | None
    currency: str
    price_basis: PriceBasis
    starts_on: date | None
    ends_on: date | None
    booking_ref: str
    preview: LinkPreviewOut | None
    tally: VoteTallyOut
    comment_count: int
    allowed_transitions: list[Status]
    web_path: str
    created_at: datetime
    updated_at: datetime


class ProposalOut(ProposalSummaryOut):
    votes: list[VoteOut]
    chosen_at: datetime | None
    booked_at: datetime | None
    discarded_at: datetime | None
    source: Source


class CommentOut(Schema):
    id: UUID
    proposal_id: UUID
    author: PersonRefOut
    body: str
    source: Source
    created_at: datetime
    can_delete: bool


class ProposalsSummaryOut(Schema):
    counts: dict[str, int]  # one key per status, always all five
    top: list[ProposalSummaryOut]


class QueuedOut(Schema):
    status: Literal["queued"]


class DuplicateProposalOut(ErrorOut):
    """``409 duplicate_proposal``: the one error body with an extra field."""

    proposal_id: UUID
