"""Input rules of proposals and comments (pure)."""

import re
from datetime import date
from decimal import Decimal, InvalidOperation

from proposals.domain.classifier import CATEGORIES

TITLE_MAX = 300
NOTE_MAX = 2000
COMMENT_MAX = 2000
BOOKING_REF_MAX = 120
PRICE_BASES = ("total", "per_person", "per_night")
_MAX_PRICE = Decimal("9999999999.99")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class InvalidProposalError(ValueError):
    """An input is not acceptable; ``code`` is the API error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def clean_line(value: str, limit: int) -> str:
    """One line of printable text: control characters dropped, whitespace collapsed, cut."""
    return re.sub(r"\s+", " ", _CONTROL.sub("", value)).strip()[:limit]


def clean_block(value: str, limit: int) -> str:
    return _CONTROL.sub("", value).strip()[:limit]


def validate_title(title: str) -> str:
    cleaned = clean_line(title, TITLE_MAX)
    if not cleaned:
        raise InvalidProposalError("invalid_request", "title must not be empty")
    return cleaned


def validate_category(category: str) -> str:
    if category not in CATEGORIES:
        raise InvalidProposalError("invalid_request", f"unknown category {category!r}")
    return category


def validate_price_basis(basis: str) -> str:
    if basis not in PRICE_BASES:
        raise InvalidProposalError("invalid_request", f"unknown price basis {basis!r}")
    return basis


def parse_price(raw: str | Decimal | None) -> Decimal | None:
    """A non-negative amount with at most two decimals (rounded), or ``None``."""
    if raw is None or raw == "":
        return None
    try:
        amount = Decimal(str(raw).strip())
    except InvalidOperation as exc:
        raise InvalidProposalError("invalid_request", "price is not a number") from exc
    if not amount.is_finite() or amount < 0 or amount > _MAX_PRICE:
        raise InvalidProposalError("invalid_request", "price is out of range")
    return amount.quantize(Decimal("0.01"))


def normalize_currency(raw: str) -> str:
    code = raw.strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", code):
        raise InvalidProposalError("invalid_request", "currency must be a 3-letter code")
    return code


def validate_dates(starts_on: date | None, ends_on: date | None) -> None:
    if starts_on is not None and ends_on is not None and ends_on < starts_on:
        raise InvalidProposalError("invalid_dates", "ends_on must not be before starts_on")


def validate_comment(body: str) -> str:
    cleaned = clean_block(body, COMMENT_MAX + 1)
    if not cleaned:
        raise InvalidProposalError("invalid_request", "comment must not be empty")
    if len(cleaned) > COMMENT_MAX:
        raise InvalidProposalError("invalid_request", "comment is too long")
    return cleaned
