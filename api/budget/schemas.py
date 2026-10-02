from typing import Literal
from uuid import UUID

from ninja import Schema


class BudgetLineOut(Schema):
    proposal_id: UUID
    title: str
    category: Literal["lodging", "transport", "activity", "food", "gear", "destination", "other"]
    status: Literal["chosen", "booked"]
    price_basis: Literal["total", "per_person", "per_night"]
    original_amount: str
    original_currency: str
    nights: int | None
    nights_assumed: bool
    amount: str | None
    per_person: str | None


class MissingPriceOut(Schema):
    proposal_id: UUID
    title: str


class BudgetOut(Schema):
    currency: str
    participants: int
    participants_basis: Literal["in", "in_maybe", "minimum"]
    lines: list[BudgetLineOut]
    by_category: dict[str, str]
    committed: str
    expected: str
    total: str
    per_person: str
    remainder: str
    unconverted: list[BudgetLineOut]
    missing_price: list[MissingPriceOut]
    fx_rates: dict[str, str]
    gastito_url: str | None


class FxRatesIn(Schema):
    rates: dict[str, str]
