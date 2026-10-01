from datetime import UTC, datetime, timedelta

import time_machine

from shared.clock import Clock, FrozenClock, SystemClock


def test_system_clock_returns_aware_utc():
    now = SystemClock().now()
    assert now.tzinfo is not None
    assert now.utcoffset() == timedelta(0)


@time_machine.travel(datetime(2026, 10, 1, 12, 0, tzinfo=UTC), tick=False)
def test_system_clock_reads_the_current_time():
    assert SystemClock().now() == datetime(2026, 10, 1, 12, 0, tzinfo=UTC)


def test_frozen_clock_returns_fixed_instant_until_advanced():
    start = datetime(2026, 1, 1, tzinfo=UTC)
    clock = FrozenClock(start)
    assert clock.now() == start
    clock.advance(timedelta(minutes=5))
    assert clock.now() == start + timedelta(minutes=5)


def test_frozen_clock_rejects_naive_datetimes():
    import pytest

    with pytest.raises(ValueError):
        FrozenClock(datetime(2026, 1, 1))


def test_clocks_satisfy_the_protocol():
    clocks: list[Clock] = [SystemClock(), FrozenClock(datetime(2026, 1, 1, tzinfo=UTC))]
    assert all(isinstance(c.now(), datetime) for c in clocks)
