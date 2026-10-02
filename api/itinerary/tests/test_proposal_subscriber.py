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


def test_preview_location_coordinates_and_copy_does_not_follow_edits(trip, ana):
    from linkpreview.models import LinkPreview

    preview = LinkPreview.objects.create(
        url="https://example.test/place",
        canonical_url="https://example.test/place",
        site_name="Base",
        title="Preview",
        lat="-41.150000",
        lng="-71.300000",
    )
    p = Proposal.objects.create(
        trip=trip, author=ana, title="Stay", category="lodging", link_preview=preview
    )
    publish(p)
    e = ItineraryEntry.objects.get(proposal=p)
    assert e.location_label == "Base"
    assert float(e.lat) == -41.15
    assert float(e.lng) == -71.3
    p.title = "Different"
    p.save()
    publish(p, "booked")
    e.refresh_from_db()
    assert e.title == "Stay"


def test_status_transition_through_http_creates_entry_in_same_action(trip, ana, client_as):
    from itinerary.tests.conftest import send

    p = Proposal.objects.create(trip=trip, author=ana, title="Walk", category="activity")
    response = send(client_as(ana), "post", f"/api/proposals/{p.id}/transition", {"to": "chosen"})
    assert response.status_code == 200, response.content
    assert ItineraryEntry.objects.get(proposal=p).created_by_id == ana.id
    assert response.json()["status"] == "chosen"
