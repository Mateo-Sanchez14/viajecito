from datetime import UTC, date, datetime

import pytest

from logistics.models import Task
from logistics.subscribers import on_proposal_status_changed
from proposals.models import Proposal

pytestmark = pytest.mark.django_db


def test_lifecycle_idempotent(trip, ana):
    trip.start_on = date(2027, 7, 1)
    trip.save()
    proposal = Proposal.objects.create(
        trip=trip, author=ana, title="Cabin", category="lodging", status="chosen"
    )
    event = {
        "proposal_id": str(proposal.pk),
        "trip_id": str(trip.pk),
        "from_status": "discussing",
        "to_status": "chosen",
        "actor_id": str(ana.pk),
        "occurred_at": datetime.now(UTC),
    }
    on_proposal_status_changed(**event)
    on_proposal_status_changed(**event)
    task = Task.objects.get(proposal=proposal)
    assert task.owner == ana and task.due_on == date(2027, 6, 17)
    event["to_status"] = "booked"
    on_proposal_status_changed(**event)
    task.refresh_from_db()
    assert task.status == "done" and task.done_by == ana
    event["to_status"] = "chosen"
    on_proposal_status_changed(**event)
    task.refresh_from_db()
    assert task.status == "open" and task.done_at is None
    event["to_status"] = "discussing"
    on_proposal_status_changed(**event)
    assert not Task.objects.filter(proposal=proposal).exists()
    event["to_status"] = "booked"
    on_proposal_status_changed(**event)
    event["to_status"] = "discarded"
    on_proposal_status_changed(**event)
    assert Task.objects.get(proposal=proposal).status == "done"


def test_synchronous_booking_subscriber_rolls_back_with_publisher(trip, ana):
    from django.db import transaction

    from shared import events

    proposal = Proposal.objects.create(
        trip=trip, author=ana, title="Bus", category="transport", status="discussing"
    )

    def fail(**kwargs):
        raise RuntimeError("consumer failed")

    events.subscribe("proposal.status_changed", on_proposal_status_changed)
    events.subscribe("proposal.status_changed", fail)
    with pytest.raises(RuntimeError), transaction.atomic():
        proposal.status = "chosen"
        proposal.save()
        events.publish(
            "proposal.status_changed",
            proposal_id=str(proposal.pk),
            trip_id=str(trip.pk),
            to_status="chosen",
            actor_id=str(ana.pk),
            occurred_at=datetime.now(UTC),
        )
    proposal.refresh_from_db()
    assert proposal.status == "discussing" and not Task.objects.filter(proposal=proposal).exists()
