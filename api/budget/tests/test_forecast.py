from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from budget.domain.forecast import forecast


def proposal(id="p", **fields):
    return SimpleNamespace(
        id=id,
        title="Cabin",
        category="lodging",
        status="chosen",
        est_price=Decimal("100"),
        price_basis="total",
        currency="ARS",
        starts_on=None,
        ends_on=None,
        **fields,
    )


def test_whole_pesos_remainder_and_missing_rate():
    trip = SimpleNamespace(currency="ARS", fx_rates={}, start_on=None, end_on=None)
    person = [SimpleNamespace(rsvp="in") for _ in range(3)]
    result = forecast([proposal()], trip, person)
    assert result["total"] == "100" and result["per_person"] == "33" and result["remainder"] == "1"
    usd = proposal()
    usd.currency = "USD"
    result = forecast([usd], trip, person)
    assert result["total"] == "0" and len(result["unconverted"]) == 1


def test_bases_nights_conversion_and_fallback():
    trip = SimpleNamespace(
        currency="USD", fx_rates={"ARS": "1000"}, start_on=date(2026, 1, 1), end_on=date(2026, 1, 4)
    )
    p = proposal()
    p.price_basis = "per_person"
    p.est_price = Decimal("10000")
    people = [SimpleNamespace(rsvp="maybe") for _ in range(2)]
    result = forecast([p], trip, people)
    assert result["participants_basis"] == "in_maybe" and result["total"] == "20.00"
    p.price_basis = "per_night"
    result = forecast([p], trip, [])
    assert result["total"] == "30.00" and result["participants_basis"] == "minimum"
    trip.start_on = None
    result = forecast([p], trip, [])
    assert result["total"] == "10.00" and result["lines"][0]["nights_assumed"]
    p.est_price = None
    assert len(forecast([p], trip, [])["missing_price"]) == 1


def test_zero_nights_is_not_an_assumed_one():
    trip = SimpleNamespace(currency="ARS", fx_rates={}, start_on=None, end_on=None)
    p = proposal()
    p.price_basis = "per_night"
    p.starts_on = p.ends_on = date(2026, 1, 1)
    result = forecast([p], trip, [])
    assert result["total"] == "0" and result["lines"][0]["nights"] == 0
