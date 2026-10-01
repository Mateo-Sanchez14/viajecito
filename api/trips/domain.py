"""Pure trip rules (no Django, no HTTP)."""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

TRIP_STATUSES = ("idea", "planning", "booked", "ongoing", "done")
ACTIVE_STATUSES = ("planning", "booked", "ongoing")  # trips that still need reminders
RSVP_VALUES = ("in", "maybe", "out", "pending")
DEFAULT_TRIP_TYPE = "generic"
DEFAULT_CURRENCY = "USD"
MAX_FX_RATES = 10
_CURRENCY_CODE = re.compile(r"^[A-Z]{3}$")


class InvalidTripInputError(ValueError):
    """A trip field is not acceptable."""


@dataclass(frozen=True)
class TripData:
    id: str
    crew_id: str
    name: str
    type: str
    status: str
    start_on: date | None
    end_on: date | None
    destination_label: str
    timezone: str
    currency: str
    fx_rates: dict[str, str]


TripRef = TripData  # what other apps get back from the callable use cases


@dataclass(frozen=True)
class ParticipantData:
    person_id: str
    display_name: str
    rsvp: str


def validate_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise InvalidTripInputError("trip name must not be empty")
    return cleaned


def validate_dates(start_on: date | None, end_on: date | None) -> tuple[date | None, date | None]:
    if start_on is not None and end_on is not None and end_on < start_on:
        raise InvalidTripInputError("end_on must not be before start_on")
    return start_on, end_on


def normalize_currency(raw: str) -> str:
    cleaned = raw.strip().upper()
    if len(cleaned) != 3 or not (cleaned.isascii() and cleaned.isalpha()):
        raise InvalidTripInputError("currency must be a 3-letter code")
    return cleaned


def validate_fx_rates(raw: Mapping[str, Any]) -> dict[str, str]:
    """``{"<ISO 4217 code>": <decimal > 0>}`` with at most 10 keys, as decimal strings."""
    if len(raw) > MAX_FX_RATES:
        raise InvalidTripInputError(f"at most {MAX_FX_RATES} fx rates are allowed")
    clean: dict[str, str] = {}
    for code, value in raw.items():
        if not isinstance(code, str) or not _CURRENCY_CODE.match(code):
            raise InvalidTripInputError("fx rate keys must be 3 uppercase letters")
        try:
            if value is None or isinstance(value, bool):
                raise InvalidOperation
            rate = Decimal(str(value).strip())
        except InvalidOperation as exc:
            raise InvalidTripInputError(f"fx rate for {code} is not a number") from exc
        if not rate.is_finite() or rate <= 0:
            raise InvalidTripInputError(f"fx rate for {code} must be a positive number")
        clean[code] = format(rate, "f")
    return clean


def validate_status(status: str) -> str:
    if status not in TRIP_STATUSES:
        raise InvalidTripInputError(f"status must be one of {', '.join(TRIP_STATUSES)}")
    return status


def validate_rsvp(rsvp: str) -> str:
    if rsvp not in RSVP_VALUES:
        raise InvalidTripInputError(f"rsvp must be one of {', '.join(RSVP_VALUES)}")
    return rsvp


@dataclass(frozen=True)
class TripDetail:
    trip: TripData
    modules: list[str]
    participants: list[ParticipantData]
    my_rsvp: str
