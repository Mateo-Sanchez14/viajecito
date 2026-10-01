from datetime import UTC, datetime, timedelta
from io import StringIO

import pytest
import time_machine
from django.core.management import call_command

from crews.models import WhatsAppGroupLink
from logistics.models import Task
from logistics.reminders import on_queued, task_nag
from messaging import reminders
from messaging.models import JobLock, OutboundMessage
from messaging.use_cases.dispatch_queued import DispatchResult

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    "tz,night,morning",
    [
        (
            "America/Argentina/Buenos_Aires",
            datetime(2026, 10, 2, 2, 30, tzinfo=UTC),
            datetime(2026, 10, 2, 12, tzinfo=UTC),
        ),
        (
            "America/Santiago",
            datetime(2026, 10, 2, 2, 30, tzinfo=UTC),
            datetime(2026, 10, 2, 12, tzinfo=UTC),
        ),
    ],
)
def test_ticks_quiet_then_once_per_day(trip, ana, settings, monkeypatch, tz, night, morning):
    trip.timezone = tz
    trip.save()
    WhatsAppGroupLink.objects.filter(crew=trip.crew).update(last_synced_at=morning)
    settings.GOWA_BASE_URL = "http://not-used.invalid"
    # Exercise queue and nudge transaction; delivery is independently owned/tested by core.
    monkeypatch.setattr(
        "messaging.adapters.tick_wiring.dispatch_queued", lambda **kwargs: DispatchResult()
    )
    task = Task.objects.create(trip=trip, number=1, title="Food", owner=ana, due_on=night.date())
    reminders.register_reminder_rule("logistics.task_nag", task_nag, on_queued=on_queued)
    with time_machine.travel(night, tick=False):
        call_command("tick", stdout=StringIO())
    assert OutboundMessage.objects.count() == 0
    with time_machine.travel(morning, tick=False):
        call_command("tick", stdout=StringIO())
        call_command("tick", stdout=StringIO())
    assert OutboundMessage.objects.count() == 1
    task.refresh_from_db()
    assert task.nudge_count == 1
    assert "@549" in OutboundMessage.objects.get().body
    with time_machine.travel(morning + timedelta(days=1), tick=False):
        call_command("tick", stdout=StringIO())
    assert OutboundMessage.objects.count() == 2


def test_held_tick_lock_does_not_nudge(trip, ana):
    now = datetime.now(UTC)
    JobLock.objects.create(name="tick", locked_until=now + timedelta(minutes=1), locked_by="other")
    task = Task.objects.create(trip=trip, number=1, title="Food", due_on=now.date())
    reminders.register_reminder_rule("logistics.task_nag", task_nag, on_queued=on_queued)
    call_command("tick", stdout=StringIO())
    task.refresh_from_db()
    assert task.nudge_count == 0 and not OutboundMessage.objects.exists()
