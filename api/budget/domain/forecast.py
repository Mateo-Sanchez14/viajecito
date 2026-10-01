"""Exact Decimal forecast; manual FX is currency units per unit of trip currency."""

from decimal import ROUND_HALF_UP, Decimal, localcontext

MINOR_UNITS = {"ARS": 0, "CLP": 0, "PYG": 0, "UYU": 0, "USD": 2, "EUR": 2, "BRL": 2}


def forecast(proposals, trip, people):
    participants = sum(p.rsvp == "in" for p in people)
    basis = "in"
    if not participants:
        participants = sum(p.rsvp in ("in", "maybe") for p in people)
        basis = "in_maybe"
    if not participants:
        participants = 1
        basis = "minimum"
    quantum = Decimal(1).scaleb(-MINOR_UNITS.get(trip.currency, 2))

    def rounded(value):
        return format(value.quantize(quantum, rounding=ROUND_HALF_UP), "f")

    lines = []
    unconverted = []
    missing = []
    by_category = {}
    committed = Decimal(0)
    expected = Decimal(0)
    with localcontext() as context:
        context.prec = 60
        for p in proposals:
            if p.status not in ("chosen", "booked"):
                continue
            if p.est_price is None:
                missing.append({"proposal_id": p.id, "title": p.title})
                continue
            amount = p.est_price
            nights = None
            assumed = False
            if p.price_basis == "per_person":
                amount *= participants
            elif p.price_basis == "per_night":
                start, end = p.starts_on, p.ends_on
                if start is None or end is None:
                    start, end = trip.start_on, trip.end_on
                nights = (end - start).days if start and end else 1
                assumed = start is None or end is None
                amount *= nights
            rate = (
                Decimal(1)
                if p.currency == trip.currency
                else Decimal(trip.fx_rates[p.currency])
                if p.currency in trip.fx_rates
                else None
            )
            converted = amount / rate if rate else None
            line = {
                "proposal_id": p.id,
                "title": p.title,
                "category": p.category,
                "status": p.status,
                "price_basis": p.price_basis,
                "original_amount": format(amount, "f"),
                "original_currency": p.currency,
                "nights": nights,
                "nights_assumed": assumed,
                "amount": rounded(converted) if converted is not None else None,
                "per_person": rounded(converted / participants) if converted is not None else None,
            }
            lines.append(line)
            if converted is None:
                unconverted.append(line)
                continue
            by_category[p.category] = by_category.get(p.category, Decimal(0)) + converted
            if p.status == "booked":
                committed += converted
            else:
                expected += converted
        total = (committed + expected).quantize(quantum, rounding=ROUND_HALF_UP)
        split = (total / participants).quantize(quantum, rounding=ROUND_HALF_UP)
        remainder = total - split * participants
        return {
            "currency": trip.currency,
            "participants": participants,
            "participants_basis": basis,
            "lines": lines,
            "by_category": {k: rounded(v) for k, v in by_category.items()},
            "committed": rounded(committed),
            "expected": rounded(expected),
            "total": rounded(total),
            "per_person": rounded(split),
            "remainder": rounded(remainder),
            "unconverted": unconverted,
            "missing_price": missing,
            "fx_rates": trip.fx_rates,
            "gastito_url": None,
        }
