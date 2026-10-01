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
