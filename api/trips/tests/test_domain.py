from datetime import date

import pytest

from trips import domain


def test_end_before_start_is_rejected():
    with pytest.raises(domain.InvalidTripInputError):
        domain.validate_dates(date(2026, 7, 10), date(2026, 7, 9))


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (None, None),
        (date(2026, 7, 1), None),
        (None, date(2026, 7, 1)),
        (date(2026, 7, 1), date(2026, 7, 1)),
    ],
)
def test_partial_equal_or_missing_dates_are_valid(start, end):
    assert domain.validate_dates(start, end) == (start, end)


def test_currency_is_uppercased_and_trimmed():
    assert domain.normalize_currency(" usd ") == "USD"


@pytest.mark.parametrize("raw", ["", "US", "USDD", "U5D", "12 "])
def test_currency_must_be_three_letters(raw):
    with pytest.raises(domain.InvalidTripInputError):
        domain.normalize_currency(raw)


def test_name_is_trimmed_and_required():
    assert domain.validate_name("  Bariloche ") == "Bariloche"
    with pytest.raises(domain.InvalidTripInputError):
        domain.validate_name("   ")


def test_status_and_rsvp_choices_are_closed():
    assert domain.validate_status("booked") == "booked"
    assert domain.validate_rsvp("maybe") == "maybe"
    with pytest.raises(domain.InvalidTripInputError):
        domain.validate_status("cancelled")
    with pytest.raises(domain.InvalidTripInputError):
        domain.validate_rsvp("yes")
