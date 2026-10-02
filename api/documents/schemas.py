from datetime import date, datetime
from typing import Literal
from uuid import UUID

from ninja import Schema
from pydantic import Field

from shared.schemas import PersonRefOut

DocumentKind = Literal["reservation", "ticket", "insurance", "id", "photo", "other"]
Visibility = Literal["crew", "owner_only"]


class DocumentOut(Schema):
    id: UUID
    trip_id: UUID
    title: str
    kind: DocumentKind
    mime: str
    size: int
    visibility: Visibility
    owner: PersonRefOut | None
    uploader: PersonRefOut
    valid_until: date | None
    proposal_id: UUID | None
    created_at: datetime
    download_path: str
    can_delete: bool


class DocumentPatchIn(Schema):
    title: str = Field(default=None, min_length=1, max_length=200)
    kind: DocumentKind = None
    visibility: Visibility = None
    valid_until: date | None = None
    proposal_id: UUID | None = None
