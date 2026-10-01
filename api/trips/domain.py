"""Pure trip rules (no Django, no HTTP)."""

from dataclasses import dataclass
from datetime import date

TRIP_STATUSES = ("idea", "planning", "booked", "ongoing", "done")
ACTIVE_STATUSES = ("planning", "booked", "ongoing")  # trips that still need reminders
RSVP_VALUES = ("in", "maybe", "out", "pending")
DEFAULT_TRIP_TYPE = "generic"
DEFAULT_CURRENCY = "USD"


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
