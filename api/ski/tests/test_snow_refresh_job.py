from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import respx

from ski.adapters.django_store import DjangoSnowStore
from ski.models import SnowFetchState, SnowReport
from ski.ports import ProviderError, SnowReading
from ski.tests.factories import make_resort, make_trip
from ski.use_cases.refresh_snow import refresh_snow

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 7, 15, 18, 30, tzinfo=UTC)
TODAY = NOW.date()


class FakeProvider:
    def __init__(self, fail_with=None):
        self.calls: list[str] = []
        self.fail_with = fail_with

    def fetch(self, resort, now):
        self.calls.append(resort.slug)
        if self.fail_with is not None:
            raise self.fail_with
        return SnowReading(
            observed_at=now.replace(minute=0, second=0, microsecond=0),
            elevation_m=1565,
            base_cm=110,
            new_24h_cm=Decimal("6.2"),
            forecast_72h_cm=Decimal("18.7"),
            temp_c=Decimal("-2.4"),
            raw={"elevation": 1565},
        )


def run(provider, *, now=NOW, **kwargs):
    return refresh_snow(now, DjangoSnowStore(), provider, **kwargs)


def test_fetches_a_resort_on_an_active_trip_and_stores_the_report():
    resort = make_resort()
    make_trip(resorts=[resort], status="planning")
    provider = FakeProvider()
    result = run(provider)
    assert result == {"snow_fetched": 1, "snow_failed": 0}
    report = SnowReport.objects.get(resort=resort)
    assert report.source == "open_meteo" and report.base_cm == 110
    assert report.new_24h_cm == Decimal("6.2") and report.fetched_at == NOW
    state = SnowFetchState.objects.get(resort=resort)
    assert state.last_success_at == NOW and state.next_attempt_at == NOW + timedelta(hours=3)
    assert state.consecutive_failures == 0 and state.last_error == ""


@pytest.mark.parametrize("status", ["planning", "booked", "ongoing"])
def test_active_statuses_are_refreshed(status):
    make_trip(resorts=[make_resort()], status=status)
    assert run(FakeProvider())["snow_fetched"] == 1


@pytest.mark.parametrize("status", ["idea", "done"])
def test_idea_and_done_trips_are_skipped(status):
    resort = make_resort()
    make_trip(resorts=[resort], status=status)
    provider = FakeProvider()
    assert run(provider) == {"snow_fetched": 0, "snow_failed": 0}
    assert provider.calls == [] and not SnowReport.objects.exists()


def test_resorts_without_trips_are_skipped():
    make_resort()
    provider = FakeProvider()
    run(provider)
    assert provider.calls == []


def test_past_trips_are_skipped_but_yesterdays_end_date_still_counts():
    old = make_resort("old")
    just_ended = make_resort("just-ended")
    make_trip(resorts=[old], end_on=TODAY - timedelta(days=2))
    make_trip(resorts=[just_ended], end_on=TODAY - timedelta(days=1))
    provider = FakeProvider()
    run(provider)
    assert provider.calls == ["just-ended"]


def test_open_ended_and_future_trips_are_refreshed():
    a, b = make_resort("a"), make_resort("b")
    make_trip(resorts=[a], end_on=None)
    make_trip(resorts=[b], start_on=TODAY + timedelta(days=30), end_on=TODAY + timedelta(days=37))
    provider = FakeProvider()
    run(provider)
    assert sorted(provider.calls) == ["a", "b"]


def test_a_resort_shared_by_two_trips_is_fetched_once():
    resort = make_resort()
    make_trip(resorts=[resort])
    make_trip(resorts=[resort], name="Otro")
    provider = FakeProvider()
    run(provider)
    assert provider.calls == ["cerro-catedral"]


def test_inactive_and_manual_resorts_are_skipped():
    make_trip(resorts=[make_resort("off", active=False), make_resort("hand", provider="manual")])
    provider = FakeProvider()
    run(provider)
    assert provider.calls == []


def test_three_hour_cadence():
    make_trip(resorts=[make_resort()])
    provider = FakeProvider()
    run(provider)
    run(provider, now=NOW + timedelta(hours=2, minutes=59))
    assert len(provider.calls) == 1
    run(provider, now=NOW + timedelta(hours=3))
    assert len(provider.calls) == 2


def test_failure_backs_off_15_30_60_minutes_up_to_6_hours_and_success_resets():
    resort = make_resort()
    make_trip(resorts=[resort])
    failing = FakeProvider(ProviderError("http_503"))
    expected = [15, 30, 60, 120, 240, 360, 360]
    now = NOW
    for minutes in expected:
        assert run(failing, now=now) == {"snow_fetched": 0, "snow_failed": 1}
        state = SnowFetchState.objects.get(resort=resort)
        assert state.next_attempt_at == now + timedelta(minutes=minutes)
        assert state.last_error == "http_503"
        now = state.next_attempt_at
    assert SnowFetchState.objects.get(resort=resort).consecutive_failures == len(expected)
    assert not SnowReport.objects.exists()

    assert run(FakeProvider(), now=now)["snow_fetched"] == 1
    state = SnowFetchState.objects.get(resort=resort)
    assert state.consecutive_failures == 0 and state.last_error == ""
    assert state.next_attempt_at == now + timedelta(hours=3)


def test_nothing_is_fetched_inside_the_backoff_window():
    make_trip(resorts=[make_resort()])
    failing = FakeProvider(ProviderError("timeout"))
    run(failing)
    run(failing, now=NOW + timedelta(minutes=14))
    assert len(failing.calls) == 1
    run(failing, now=NOW + timedelta(minutes=15))
    assert len(failing.calls) == 2


def test_at_most_four_resorts_per_tick_and_the_rest_next_tick():
    resorts = [make_resort(f"r{i}") for i in range(6)]
    make_trip(resorts=resorts)
    provider = FakeProvider()
    assert run(provider)["snow_fetched"] == 4
    assert run(provider, now=NOW + timedelta(minutes=1))["snow_fetched"] == 2
    assert sorted(provider.calls) == sorted(r.slug for r in resorts)


def test_the_tick_deadline_stops_the_job():
    make_trip(resorts=[make_resort(f"r{i}") for i in range(3)])
    provider = FakeProvider()
    budget = iter([True, False, False])
    result = run(provider, has_time=lambda: next(budget))
    assert result["snow_fetched"] == 1 and len(provider.calls) == 1


def test_never_raises_even_on_unexpected_errors():
    resort = make_resort()
    make_trip(resorts=[resort])
    result = run(FakeProvider(RuntimeError("boom")))
    assert result == {"snow_fetched": 0, "snow_failed": 1}
    assert SnowFetchState.objects.get(resort=resort).last_error == "unexpected"


def test_prunes_old_provider_rows_but_keeps_manual_ones():
    resort = make_resort()
    make_trip(resorts=[resort])
    old = NOW - timedelta(days=31)
    for source in ("open_meteo", "manual"):
        SnowReport.objects.create(
            resort=resort, source=source, observed_at=old, fetched_at=old, base_cm=50
        )
    recent = NOW - timedelta(days=29)
    SnowReport.objects.create(
        resort=resort, source="open_meteo", observed_at=recent, fetched_at=recent, base_cm=60
    )
    run(FakeProvider())
    sources = sorted(
        SnowReport.objects.filter(observed_at__lt=NOW - timedelta(days=30)).values_list(
            "source", flat=True
        )
    )
    assert sources == ["manual"]
    assert SnowReport.objects.filter(observed_at=recent).exists()


def test_registered_tick_job_uses_open_meteo_and_reports_counters(settings):
    import json
    from pathlib import Path

    from messaging.reminders import registered_tick_jobs

    fixture = Path(__file__).parent / "fixtures" / "open_meteo" / "catedral_snowy.json"
    make_trip(resorts=[make_resort()])
    jobs = dict(registered_tick_jobs())
    with respx.mock as router:
        router.get("https://api.open-meteo.com/v1/forecast").respond(
            200, json=json.loads(fixture.read_text())
        )
        assert jobs["ski.snow_refresh"](NOW) == {"snow_fetched": 1, "snow_failed": 0}
    assert SnowReport.objects.get().base_cm == 115
