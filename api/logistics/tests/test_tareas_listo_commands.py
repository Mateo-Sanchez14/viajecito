from types import SimpleNamespace

import pytest

from logistics.bot.subcommands import listo, tareas
from logistics.models import Task

pytestmark = pytest.mark.django_db


def test_commands_format_and_status(trip, ana):
    trip.crew.default_trip = trip
    trip.crew.save()
    task = Task.objects.create(trip=trip, number=3, title="Food", owner=ana)
    replies = []
    ctx = SimpleNamespace(
        crew_id=str(trip.crew_id),
        person_id=str(ana.pk),
        reply=lambda s: replies.append(s) or "sent",
    )
    tareas(ctx, "")
    assert "#3 Food — Ana" in replies[-1]
    listo(ctx, "")
    assert "Usalo así" in replies[-1]
    listo(ctx, "abc")
    assert "Usalo así" in replies[-1]
    listo(ctx, "99")
    assert "No encontré" in replies[-1]
    listo(ctx, "3")
    task.refresh_from_db()
    assert task.status == "done" and task.done_by == ana
    listo(ctx, "3")
    assert "ya estaba hecha" in replies[-1]
    ana.display_name = ""
    ana.save()
    task.status = "open"
    task.save()
    tareas(ctx, "")
    assert ana.phone not in replies[-1] and "alguien" in replies[-1]


def test_digest_owner_names_never_phone_fallback(trip, ana):
    from datetime import date

    from logistics.reminders import digest_section

    Task.objects.create(trip=trip, number=1, title="Food", owner=ana, due_on=date(2026, 10, 1))
    assert "Ana" in digest_section(str(trip.pk), date(2026, 10, 1))
    ana.display_name = ""
    ana.save()
    assert ana.phone not in digest_section(str(trip.pk), date(2026, 10, 1))


@pytest.mark.parametrize("number", ["²", "-1", "1.0", "1234567890"])
def test_malformed_task_number_replies_with_usage(trip, ana, number):
    from logistics.copy import es_ar

    replies = []
    ctx = SimpleNamespace(
        crew_id=str(trip.crew_id),
        person_id=str(ana.pk),
        reply=lambda text: replies.append(text) or "sent",
    )
    result = listo(ctx, number)
    assert replies == [es_ar.LISTO_USAGE]
    assert result is not None
