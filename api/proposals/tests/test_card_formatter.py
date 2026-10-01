import pytest

from proposals.copy import es_ar
from proposals.domain.card import CardSnapshot, format_card

URL = "https://viajecito.example.com/crews/c1/trips/t1/proposals/p1"


def snap(**overrides) -> CardSnapshot:
    values = {
        "title": "Cabañas del Sur",
        "category": "lodging",
        "est_price": None,
        "currency": "USD",
        "price_basis": "total",
        "site_name": "",
    }
    return CardSnapshot(**{**values, **overrides})


def test_lodging_card_with_price_and_site():
    card = format_card(
        snap(est_price="120.00", price_basis="per_night", site_name="Booking.com"), URL
    )
    assert card == (
        "🏠 *Cabañas del Sur*\n"
        "Alojamiento · 120 USD por noche\n"
        "Booking.com\n"
        f"👉 {URL}\n"
        'Respondé a este mensaje con +1, -1, "elegida" o "descartar".'
    )


def test_minimal_card_has_no_price_and_no_site_line():
    assert format_card(snap(category="other", title="Algo"), URL) == (
        f'🔗 *Algo*\nOtro\n👉 {URL}\nRespondé a este mensaje con +1, -1, "elegida" o "descartar".'
    )


@pytest.mark.parametrize(
    ("category", "emoji", "label"),
    [
        ("lodging", "🏠", "Alojamiento"),
        ("transport", "🚌", "Transporte"),
        ("activity", "🎿", "Actividad"),
        ("food", "🍽️", "Comida"),
        ("gear", "🧤", "Equipo"),
        ("destination", "📍", "Destino"),
        ("other", "🔗", "Otro"),
    ],
)
def test_every_category_has_its_emoji_and_label(category, emoji, label):
    card = format_card(snap(category=category), URL)
    assert card.startswith(f"{emoji} *Cabañas del Sur*\n{label}\n")


@pytest.mark.parametrize(
    ("basis", "suffix"),
    [("total", ""), ("per_person", " por persona"), ("per_night", " por noche")],
)
def test_price_basis_suffixes(basis, suffix):
    card = format_card(snap(est_price="99.50", price_basis=basis, currency="ARS"), URL)
    assert f"\nAlojamiento · 99.50 ARS{suffix}\n" in card


def test_integral_prices_drop_the_decimals():
    assert " · 1500 ARS\n" in format_card(snap(est_price="1500.00", currency="ARS"), URL)


def test_titles_cannot_break_whatsapp_markup_or_smuggle_control_characters():
    card = format_card(snap(title="*Gran*\n oferta\x07 _ya_"), URL)
    assert card.splitlines()[0] == "🏠 *Gran oferta _ya_*"


def test_long_titles_are_cut():
    first_line = format_card(snap(title="x" * 500), URL).splitlines()[0]
    assert len(first_line) <= 2 + 2 + 120


def test_the_card_never_carries_a_query_string_from_the_source():
    card = format_card(snap(), URL)
    assert "utm_" not in card and "?" not in card.replace("¿", "")


def test_card_template_is_the_copy_constant():
    assert "{url}" in es_ar.CARD and "{category_label}" in es_ar.CARD
