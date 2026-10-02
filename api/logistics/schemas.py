from datetime import date, datetime
from typing import Literal
from uuid import UUID

from ninja import Schema
from pydantic import Field

from shared.schemas import PersonRefOut

TaskKind = Literal["todo", "bring", "booking"]
TaskStatus = Literal["open", "done", "blocked"]


class TaskCreateIn(Schema):
    kind: TaskKind = "todo"
    title: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=2000)
    owner_id: UUID | None = None
    due_on: date | None = None
    quantity: int | None = Field(default=None, ge=1, le=32767)


class TaskPatchIn(Schema):
    title: str = Field(default=None, min_length=1, max_length=200)
    notes: str = Field(default=None, max_length=2000)
    owner_id: UUID | None = None
    due_on: date | None = None
    quantity: int | None = Field(default=None, ge=1, le=32767)
    kind: TaskKind = None
    status: TaskStatus = None


class TaskOut(Schema):
    id: UUID
    trip_id: UUID
    number: int
    kind: TaskKind
    title: str
    notes: str
    owner: PersonRefOut | None
    due_on: date | None
    status: TaskStatus
    quantity: int | None
    proposal_id: UUID | None
    source: Literal["manual", "proposal", "template"]
    nudge_count: int
    done_at: datetime | None
    done_by: PersonRefOut | None
    overdue: bool
    created_at: datetime
    updated_at: datetime


class PackingEntryOut(Schema):
    id: UUID
    section: str
    item_key: str | None
    label: str
    quantity: int | None
    packed: bool
    position: int


class PackingTemplateOut(Schema):
    key: str
    label: str


class PackingSectionOut(Schema):
    key: str
    label: str
    entries: list[PackingEntryOut]


class PackingProgressOut(Schema):
    packed: int
    total: int


class PackingListOut(Schema):
    templates_available: list[PackingTemplateOut]
    applied: list[str]
    sections: list[PackingSectionOut]
    progress: PackingProgressOut


class PackingApplyIn(Schema):
    template_key: str


class PackingEntryIn(Schema):
    label: str = Field(min_length=1, max_length=120)
    section: str = Field(default="custom", min_length=1, max_length=32)
    quantity: int | None = Field(default=None, ge=1, le=32767)


class PackingPatchIn(Schema):
    label: str = Field(default=None, min_length=1, max_length=120)
    quantity: int | None = Field(default=None, ge=1, le=32767)
    packed: bool = False
    position: int = Field(default=0, ge=0)


class PackingSummaryOut(Schema):
    person: PersonRefOut
    packed: int
    total: int
