from datetime import UTC, date, datetime

import pytest
from django.db import transaction

from itinerary.models import ItineraryDay, ItineraryEntry
from proposals.models import Proposal
from shared import events

pytestmark = pytest.mark.django_db


def publish(p, to="chosen"):
    events.publish(
        "proposal.status_changed",
        proposal_id=str(p.id),
        trip_id=str(p.trip_id),
        from_status="discussing",
        to_status=to,
        actor_id=None,
        occurred_at=datetime(2026, 10, 1, tzinfo=UTC),
    )


@pytest.mark.parametrize(
    "category,kind",
    [
        ("lodging", "lodging"),
        ("transport", "transport"),
        ("food", "meal"),
        ("gear", "other"),
        ("destination", "activity"),
        ("activity", "activity"),
        ("other", "other"),
    ],
)
def test_chosen_creates_once_and_maps_category(trip, ana, category, kind):
    p = Proposal.objects.create(trip=trip, author=ana, title="X" * 300, category=category)
    publish(p)
    publish(p, "booked")
    assert ItineraryEntry.objects.filter(proposal=p).count() == 1
    e = ItineraryEntry.objects.get(proposal=p)
    assert e.day is None
    assert e.kind == kind
    assert e.source == "proposal"
    assert len(e.title) == 200


def test_schedules_valid_start_and_keeps_scheduled_on_discard(trip, ana):
    p = Proposal.objects.create(
        trip=trip, author=ana, title="Walk", category="activity", starts_on=date(2026, 10, 2)
    )
    publish(p)
    e = ItineraryEntry.objects.get(proposal=p)
    assert e.day.date == date(2026, 10, 2)
    publish(p, "discarded")
    assert ItineraryEntry.objects.filter(pk=e.id).exists()


@pytest.mark.parametrize("to", ["proposed", "discussing", "discarded"])
def test_reopened_or_discarded_tray_deleted(trip, ana, to):
    p = Proposal.objects.create(
        trip=trip, author=ana, title="Walk", category="activity", starts_on=date(2026, 9, 2)
    )
    publish(p)
    assert ItineraryEntry.objects.get(proposal=p).day is None
    publish(p, to)
    assert not ItineraryEntry.objects.filter(proposal=p).exists()


def test_manual_entry_preserved_and_rollback_atomic(trip, ana):
    p = Proposal.objects.create(trip=trip, author=ana, title="Walk", category="activity")
    ItineraryEntry.objects.create(trip=trip, proposal=p, source="manual", title="Manual")
    publish(p, "discarded")
    assert ItineraryEntry.objects.filter(proposal=p).exists()
    p2 = Proposal.objects.create(
        trip=trip, author=ana, title="Other", category="activity", starts_on=date(2026, 10, 1)
    )
    with pytest.raises(RuntimeError), transaction.atomic():
        publish(p2)
        raise RuntimeError("Publisher rolls back")
    assert not ItineraryEntry.objects.filter(proposal=p2).exists()
    assert not ItineraryDay.objects.exists()
