from typing import Literal
from uuid import UUID

from ninja import Schema
from pydantic import Field, StrictInt

from crews.schemas import CrewSummaryOut
from identity.domain import MAX_TOUR_VERSION


class CsrfOut(Schema):
    csrf_token: str


class OtpRequestIn(Schema):
    phone: str


class OtpRequestOut(Schema):
    status: Literal["sent"]
    retry_after_seconds: int
    expires_in_seconds: int


class OtpVerifyIn(Schema):
    phone: str
    code: str


class PersonOut(Schema):
    id: UUID
    phone: str
    display_name: str
    locale: str
    tour_seen_version: int


class TourSeenIn(Schema):
    # Strict: booleans, numeric strings and floats are rejected instead of coerced.
    version: StrictInt = Field(..., ge=1, le=MAX_TOUR_VERSION)


class TourSeenOut(Schema):
    person: PersonOut


class OtpVerifyOut(Schema):
    person: PersonOut


class MeOut(Schema):
    person: PersonOut
    crews: list[CrewSummaryOut]
