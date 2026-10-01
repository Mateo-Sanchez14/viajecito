from typing import Literal
from uuid import UUID

from ninja import Schema


class CrewSummaryOut(Schema):
    id: UUID
    name: str
    role: Literal["admin", "member"]
    gastito_group_url: str | None
    default_trip_id: UUID | None
