from datetime import UTC, date, datetime, timedelta

import pytest

from logistics.models import Task
from logistics.reminders import on_queued, task_nag
from messaging.reminders import ReminderContext, is_quiet_time

pytestmark = pytest.mark.django_db


def test_grouped_cadence_and_exact_included_ids(trip, ana):
    first = Task.objects.create(
        trip=trip, number=1, title="Buy food", owner=ana, due_on=date(2026, 10, 1)
    )
    second = Task.objects.create(trip=trip, number=2, title="Reserve", due_on=date(2026, 10, 3))
    Task.objects.create(trip=trip, number=3, title="Later", due_on=date(2026, 11, 1))
    now = datetime(2026, 10, 1, 15, tzinfo=UTC)
    drafts = list(task_nag(ReminderContext(now)))
    assert len(drafts) == 1
    draft = drafts[0]
    assert draft.dedupe_key == f"logistics:nag:{trip.pk}:2026-10-01"
    assert "{@" + str(ana.pk) + "}" in draft.body and "Sin dueño" in draft.body
    assert set(draft.subject_id.split(",")) == {str(first.pk), str(second.pk)}
    on_queued(draft, now=now)
    first.refresh_from_db()
    assert first.nudge_count == 1
    assert list(task_nag(ReminderContext(now + timedelta(hours=1)))) == []
    assert len(list(task_nag(ReminderContext(now + timedelta(days=1))))) == 1
    first.nudge_count = 4
    first.last_nudged_at = now
    first.save()
    second.status = "done"
    second.save()
    assert list(task_nag(ReminderContext(now + timedelta(days=6)))) == []
    assert len(list(task_nag(ReminderContext(now + timedelta(days=7))))) == 1


def test_quiet_draft_waits_for_core(trip, ana):
    Task.objects.create(trip=trip, number=1, title="Food", due_on=date(2026, 10, 1))
    night = datetime(2026, 10, 2, 2, 30, tzinfo=UTC)
    draft = list(task_nag(ReminderContext(night)))[0]
    assert draft.respect_quiet_hours and is_quiet_time(night, trip.timezone)
    assert not is_quiet_time(datetime(2026, 10, 2, 12, tzinfo=UTC), trip.timezone)


@pytest.mark.parametrize("count,wait", [(0, 1), (1, 1), (2, 2), (3, 4), (4, 7), (8, 7), (20, 7)])
def test_backoff_entire_table(trip, ana, count, wait):
    now = datetime(2026, 10, 1, 15, tzinfo=UTC)
    Task.objects.create(
        trip=trip,
        number=1,
        title="Food",
        due_on=date(2026, 10, 1),
        nudge_count=count,
        last_nudged_at=now,
    )
    assert list(task_nag(ReminderContext(now + timedelta(days=wait - 1)))) == []
    assert len(list(task_nag(ReminderContext(now + timedelta(days=wait))))) == 1


@pytest.mark.parametrize("status", ["idea", "done"])
def test_inactive_trip_is_not_nagged(trip, status):
    trip.status = status
    trip.save()
    Task.objects.create(trip=trip, number=1, title="Food", due_on=date(2026, 10, 1))
    assert list(task_nag(ReminderContext(datetime(2026, 10, 1, 15, tzinfo=UTC)))) == []
