import json
from datetime import UTC, datetime
from io import StringIO

import httpx
import pytest
import respx
import time_machine
from django.core.management import call_command

from messaging import reminders
from messaging.models import OutboundMessage
from messaging.reminders import ReminderContext
from proposals.adapters.rules import majority_rule
from proposals.models import Vote
from proposals.tests.test_link_capture_integration import BASE

pytestmark = pytest.mark.django_db

NOON = datetime(2026, 3, 1, 15, 0, tzinfo=UTC)  # 12:00 in Buenos Aires
NIGHT = datetime(2026, 3, 1, 4, 0, tzinfo=UTC)  # 01:00 in Buenos Aires


def drafts(now=NOON):
    return list(majority_rule(ReminderContext(now=now)))


def vote(proposal, *people, value=1):
    for person in people:
        Vote.objects.create(proposal=proposal, person=person, value=value)


def test_one_draft_when_a_majority_of_people_in_voted_plus_one(trip, ana, beto, make_proposal):
    proposal = make_proposal(title="Cabañas del Sur")
    vote(proposal, ana, beto)  # 2 of the 3 who are in
    [draft] = drafts()
    assert draft.crew_id == str(trip.crew_id)
    assert draft.trip_id == str(trip.pk)
    assert draft.dedupe_key == f"proposals:majority:{proposal.pk}"
    assert draft.subject_type == "proposal" and draft.subject_id == str(proposal.pk)
    assert draft.timezone == "America/Argentina/Buenos_Aires"
    assert draft.mention_person_ids == ()
    assert draft.url_path == f"/crews/{trip.crew_id}/trips/{trip.pk}/proposals/{proposal.pk}"
    assert draft.title == "Cabañas del Sur"
    assert draft.body == (
        "Parece que ganó Cabañas del Sur (2 de 3). ¿La marcamos como elegida? "
        f'Respondé "elegida" a la tarjeta o entrá a https://viajecito.example.com{draft.url_path}.'
    )


def test_no_draft_below_a_majority_or_with_other_votes(trip, ana, beto, cris, make_proposal):
    proposal = make_proposal()
    vote(proposal, ana)
    assert drafts() == []
    vote(proposal, beto, value=0)
    vote(proposal, cris, value=-1)
    assert drafts() == []


def test_only_proposed_and_discussing_proposals_are_suggested(trip, ana, beto, make_proposal):
    for status in ("chosen", "booked", "discarded"):
        vote(make_proposal(status=status, title=status), ana, beto)
    assert drafts() == []
    discussing = make_proposal(status="discussing", title="en discusión")
    vote(discussing, ana, beto)
    assert [d.subject_id for d in drafts()] == [str(discussing.pk)]


def test_inactive_trips_are_skipped(trip, ana, beto, make_proposal):
    vote(make_proposal(), ana, beto)
    for status in ("idea", "done"):
        type(trip).objects.filter(pk=trip.pk).update(status=status)
        assert drafts() == []


def test_the_rule_is_registered_with_the_core_registry():
    keys = [rule.key for rule in reminders.registered_rules()]
    assert "proposals.majority" in keys
    assert "linkpreview.retry_pending" in [key for key, _ in reminders.registered_tick_jobs()]


@pytest.fixture
def gowa():
    with respx.mock(assert_all_called=False) as router:
        router.send = router.post(f"{BASE}/send/message").mock(
            return_value=httpx.Response(
                200, json={"results": {"message_id": "W-M", "status": "ok"}}
            )
        )
        yield router


def tick() -> dict:
    out = StringIO()
    call_command("tick", stdout=out)
    return json.loads(out.getvalue())


def test_the_tick_suggests_once_per_proposal_ever(trip, ana, beto, make_proposal, gowa):
    proposal = make_proposal(title="Cabañas del Sur")
    vote(proposal, ana, beto)
    with time_machine.travel(NOON, tick=False):
        assert tick()["reminders_queued"] == 1
        assert tick()["reminders_queued"] == 0
        # reopened proposals do not re-suggest
        proposal.status = "chosen"
        proposal.save()
        proposal.status = "discussing"
        proposal.save()
        assert tick()["reminders_queued"] == 0
    row = OutboundMessage.objects.get(kind="reminder")
    assert row.dedupe_key == f"proposals:majority:{proposal.pk}"
    assert (row.subject_type, row.subject_id) == ("proposal", str(proposal.pk))
    assert len(gowa.send.calls) == 1
    assert (
        "Parece que ganó Cabañas del Sur (2 de 3)"
        in json.loads(gowa.send.calls[0].request.content)["message"]
    )


def test_quiet_hours_postpone_the_suggestion_until_morning(trip, ana, beto, make_proposal, gowa):
    vote(make_proposal(), ana, beto)
    with time_machine.travel(NIGHT, tick=False):
        summary = tick()
    assert summary["reminders_quiet"] == 1 and summary["reminders_queued"] == 0
    with time_machine.travel(NOON, tick=False):
        assert tick()["reminders_queued"] == 1
