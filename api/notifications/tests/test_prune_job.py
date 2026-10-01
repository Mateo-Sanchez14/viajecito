from datetime import UTC, datetime, timedelta

import pytest

from notifications.adapters import wiring
from notifications.adapters.django_store import DjangoDeliveryLedger
from notifications.models import PushDelivery
from notifications.use_cases.push_delivery import prune_deliveries

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 10, 1, 15, 0, tzinfo=UTC)


def make(person, key, age_days):
    row = PushDelivery.objects.create(dedupe_key=key, person=person, status="sent")
    PushDelivery.objects.filter(pk=row.pk).update(created_at=NOW - timedelta(days=age_days))


def test_rows_older_than_thirty_days_are_deleted_and_counted(ana):
    make(ana, "old-1", 31)
    make(ana, "old-2", 90)
    make(ana, "fresh", 29)
    assert prune_deliveries(NOW, DjangoDeliveryLedger()) == {"deleted": 2}
    assert list(PushDelivery.objects.values_list("dedupe_key", flat=True)) == ["fresh"]


def test_each_run_deletes_at_most_the_limit_oldest_first(ana):
    for n in range(5):
        make(ana, f"old-{n}", 40 + n)
    assert prune_deliveries(NOW, DjangoDeliveryLedger(), limit=3) == {"deleted": 3}
    assert sorted(PushDelivery.objects.values_list("dedupe_key", flat=True)) == ["old-0", "old-1"]


def test_nothing_to_prune_is_a_zero(ana):
    assert prune_deliveries(NOW, DjangoDeliveryLedger()) == {"deleted": 0}


def test_the_registered_tick_job_prunes(ana):
    make(ana, "old", 45)
    assert wiring.prune_job(NOW) == {"deleted": 1}


def test_the_prune_job_runs_at_most_once_per_day(ana):
    make(ana, "old-1", 45)
    assert wiring.prune_job(NOW) == {"deleted": 1}
    make(ana, "old-2", 45)
    assert wiring.prune_job(NOW + timedelta(hours=5)) is None  # same day: skipped
    assert PushDelivery.objects.filter(dedupe_key="old-2").exists()
    assert wiring.prune_job(NOW + timedelta(days=1)) == {"deleted": 1}


def test_the_daily_claim_is_taken_by_one_caller_only():
    from notifications.adapters.django_store import DjangoJobState

    state = DjangoJobState()
    assert state.claim_daily("notifications.prune", NOW.date()) is True
    assert state.claim_daily("notifications.prune", NOW.date()) is False
    assert state.claim_daily("other", NOW.date()) is True
    assert state.claim_daily("notifications.prune", NOW.date() + timedelta(days=1)) is True
