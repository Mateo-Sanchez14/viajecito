from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest

from itinerary.bot.subcommands import hoy
from itinerary.models import ItineraryDay, ItineraryEntry, Note
from itinerary.use_cases.morning_digest import morning_digest
from messaging.reminders import ReminderContext, digest_sections, isolated, register_digest_section
from shared.clock import FrozenClock

pytestmark = pytest.mark.django_db


def test_hoy_registered_and_renders_entries_notes_link(trip, crew, ana, monkeypatch, settings):
    from messaging.handlers.commands import help_text

    settings.PUBLIC_ORIGIN = "https://viajecito.test"
    crew.default_trip = trip
    crew.save()
    day = ItineraryDay.objects.create(trip=trip, date=date(2026, 10, 1))
    ItineraryEntry.objects.create(
        trip=trip,
        day=day,
        title="Lunch",
        starts_at=datetime(2026, 10, 1, 15, tzinfo=UTC),
        is_meeting_point=True,
        location_label="Base",
    )
    Note.objects.create(trip=trip, author=ana, body="Bring gloves", pinned=True)
    monkeypatch.setattr(
        "itinerary.bot.subcommands.clock", FrozenClock(datetime(2026, 10, 1, 12, tzinfo=UTC))
    )
    sent = []
    ctx = SimpleNamespace(
        crew_id=str(crew.id), person_id=str(ana.id), reply=lambda text: sent.append(text) or "sent"
    )
    handled = hoy(ctx, "")
    assert handled.detail["command"] == "hoy"
    assert "12:00" in sent[0]
    assert "Lunch" in sent[0]
    assert "Base" in sent[0]
    assert "Bring gloves" in sent[0]
    assert f"https://viajecito.test/crews/{crew.id}/trips/{trip.id}/today" in sent[0]
    assert "/viaje hoy" in help_text()


@pytest.mark.parametrize(
    "instant,expected",
    [
        ("2026-09-30T12:00:00+00:00", True),
        ("2026-10-01T11:00:00+00:00", True),
        ("2026-10-01T12:00:00+00:00", True),
        ("2026-10-04T12:00:00+00:00", False),
        ("2026-09-29T12:00:00+00:00", False),
    ],
)
def test_digest_due_during_and_day_before(trip, instant, expected):
    drafts = list(morning_digest(ReminderContext(datetime.fromisoformat(instant))))
    assert bool(drafts) == expected
    if expected:
        assert drafts[0].respect_quiet_hours
        assert drafts[0].dedupe_key == f"itinerary:digest:{trip.id}:{instant[:10]}"
        assert drafts[0].mention_person_ids == ()
        if instant.startswith("2026-09-30"):
            assert "Mañana arrancamos" in drafts[0].body


def test_digest_appends_registered_sections_and_stable_key(trip):
    now = datetime(2026, 10, 1, 12, tzinfo=UTC)
    with isolated():
        register_digest_section("fake.snow", lambda trip_id, day: "Snow: fresh", order=10)
        one = list(morning_digest(ReminderContext(now)))[0]
        two = list(morning_digest(ReminderContext(now)))[0]
        assert "Snow: fresh" in one.body
        assert one.dedupe_key == two.dedupe_key
        assert one.url_path.endswith("/today")
        assert len(one.body) <= 4000
        assert digest_sections(str(trip.id), date(2026, 10, 1)) == ["Snow: fresh"]


@pytest.mark.parametrize("status", ["idea", "done"])
def test_inactive_trip_has_no_digest(trip, status):
    trip.status = status
    trip.save()
    assert list(morning_digest(ReminderContext(datetime(2026, 10, 1, 12, tzinfo=UTC)))) == []


def test_morning_tick_respects_quiet_hours_and_queues_once(trip, crew):
    from datetime import timedelta

    from django.db import transaction

    from crews.models import WhatsAppGroupLink
    from itinerary.adapters.reminders import morning_rule
    from messaging.adapters.crews_gateway import CrewsGateway
    from messaging.adapters.identity_gateway import IdentityGateway
    from messaging.adapters.ledger import DjangoOutboundLedger
    from messaging.models import OutboundMessage
    from messaging.reminders import register_reminder_rule
    from messaging.use_cases.queue_reminders import queue_reminders

    WhatsAppGroupLink.objects.create(crew=crew, chat_id="12000000@g.us")
    with isolated():
        register_reminder_rule("itinerary.morning_digest", morning_rule)

        def run(hour):
            now = datetime(2026, 10, 1, hour, tzinfo=UTC)
            return queue_reminders(
                chats=CrewsGateway(),
                people=IdentityGateway(),
                ledger=DjangoOutboundLedger(),
                atomic=transaction.atomic,
                now=now,
                clock=FrozenClock(now),
                deadline=now + timedelta(minutes=1),
            )

        assert run(11).quiet == 1
        assert OutboundMessage.objects.count() == 0
        assert run(12).queued == 1
        assert run(13).queued == 0
        assert OutboundMessage.objects.count() == 1
        assert OutboundMessage.objects.get().dedupe_key == f"itinerary:digest:{trip.id}:2026-10-01"


@pytest.mark.parametrize("mode", ["after", "undated"])
def test_after_and_undated_bot_replies_are_short_without_pinned_notes(trip, mode):
    from itinerary.copy import es_ar
    from itinerary.domain.render import render_today

    snapshot = SimpleNamespace(
        mode=mode,
        pinned_notes=[SimpleNamespace(body="Private pinned note")],
        entries=[],
        next_meeting_point=None,
    )
    url = f"https://viajecito.test/crews/{trip.crew_id}/trips/{trip.id}/today"
    expected = (es_ar.HOY_AFTER if mode == "after" else es_ar.HOY_UNDATED).format(trip=trip.name)
    rendered = render_today(trip, snapshot, url)
    assert rendered == expected + "\n" + es_ar.LINK_LINE.format(url=url)
    assert "Private pinned note" not in rendered
