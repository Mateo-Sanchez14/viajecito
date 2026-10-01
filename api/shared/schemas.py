"""Reusable transport schemas with no milestone-specific dependencies."""

from uuid import UUID

from ninja import Schema


class PersonRefOut(Schema):
    person_id: UUID
    display_name: str
