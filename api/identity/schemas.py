from typing import Literal
from uuid import UUID

from ninja import Schema

from crews.schemas import CrewSummaryOut


class ErrorOut(Schema):
    code: str
    message: str


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


class OtpVerifyOut(Schema):
    person: PersonOut


class MeOut(Schema):
    person: PersonOut
    crews: list[CrewSummaryOut]
