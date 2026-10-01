"""The WhatsApp card of a proposal (pure; the copy is in ``proposals.copy``)."""

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal

from proposals.copy import es_ar

TITLE_MAX = 120


@dataclass(frozen=True)
class CardSnapshot:
    title: str
    category: str
    est_price: str | Decimal | None
    currency: str
    price_basis: str
    site_name: str


def clean_title(title: str) -> str:
    """Printable text only, no WhatsApp bold markers, one line, at most ``TITLE_MAX`` chars."""
    printable = "".join(
        " " if ch.isspace() else ch
        for ch in title
        if ch.isspace() or unicodedata.category(ch) not in {"Cc", "Cf", "Cs", "Co", "Cn"}
    )
    return re.sub(r"\s+", " ", printable.replace("*", "")).strip()[:TITLE_MAX]


def format_amount(amount: str | Decimal) -> str:
    value = Decimal(str(amount))
    return str(int(value)) if value == value.to_integral_value() else f"{value:.2f}"


def format_card(snapshot: CardSnapshot, web_url: str) -> str:
    """The card body. ``web_url`` is the proposal's page in the web app: the card never carries
    the source link, so stripped tracking parameters can never come back."""
    category = snapshot.category if snapshot.category in es_ar.CATEGORY_LABELS else "other"
    price_line = ""
    if snapshot.est_price is not None:
        price_line = es_ar.PRICE_LINE.format(
            amount=format_amount(snapshot.est_price),
            currency=snapshot.currency,
            basis=es_ar.PRICE_BASIS.get(snapshot.price_basis, ""),
        )
    site = clean_title(snapshot.site_name)
    return es_ar.CARD.format(
        emoji=es_ar.CATEGORY_EMOJI[category],
        title=clean_title(snapshot.title),
        category_label=es_ar.CATEGORY_LABELS[category],
        price_line=price_line,
        site_line=es_ar.SITE_LINE.format(site_name=site) if site else "",
        url=web_url,
    )
