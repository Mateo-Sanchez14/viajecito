from datetime import UTC, datetime, timedelta

import pytest

from ski.domain import STALE_AFTER, age_hours, is_stale

NOW = datetime(2026, 7, 15, 18, 0, tzinfo=UTC)


def test_stale_after_twelve_hours():
    assert STALE_AFTER == timedelta(hours=12)


def test_eleven_fifty_nine_is_fresh():
    assert not is_stale(NOW - timedelta(hours=11, minutes=59), NOW)


def test_exactly_twelve_hours_is_fresh():
    assert not is_stale(NOW - timedelta(hours=12), NOW)


def test_twelve_hours_and_a_minute_is_stale():
    assert is_stale(NOW - timedelta(hours=12, minutes=1), NOW)


@pytest.mark.parametrize(
    ("delta", "hours"),
    [
        (timedelta(minutes=5), 0),
        (timedelta(minutes=59), 0),
        (timedelta(hours=1), 1),
        (timedelta(hours=2, minutes=59), 2),
        (timedelta(hours=30), 30),
        (timedelta(minutes=-5), 0),  # observed slightly in the future (clock skew)
    ],
)
def test_age_hours_rounds_down_and_never_goes_negative(delta, hours):
    assert age_hours(NOW - delta, NOW) == hours
