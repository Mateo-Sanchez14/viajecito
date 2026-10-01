from datetime import UTC, datetime

import pytest
import time_machine

from proposals.domain.status import InvalidTransitionError
from proposals.use_cases.transition_proposal import transition_proposal
from shared import events

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)


@time_machine.travel(NOW, tick=False)
def test_a_transition_publishes_exactly_one_event_with_the_exact_payload(
    store, make_proposal, trip, ana
):
    proposal = make_proposal()
    seen = []
    with events.isolated():
        events.subscribe("proposal.status_changed", lambda **payload: seen.append(payload))
        result = transition_proposal(store, str(proposal.pk), "chosen", str(ana.pk))
    assert result.status == "chosen"
    assert seen == [
        {
            "proposal_id": str(proposal.pk),
            "trip_id": str(trip.pk),
            "from_status": "proposed",
            "to_status": "chosen",
            "actor_id": str(ana.pk),
            "occurred_at": NOW,
        }
    ]
    assert seen[0]["occurred_at"].tzinfo is not None


def test_no_event_on_a_noop_transition(store, make_proposal, ana):
    proposal = make_proposal(status="chosen")
    seen = []
    with events.isolated():
        events.subscribe("proposal.status_changed", lambda **payload: seen.append(payload))
        result = transition_proposal(store, str(proposal.pk), "chosen", str(ana.pk))
    assert result.status == "chosen"
    assert seen == []


def test_no_event_for_an_invalid_transition_and_nothing_changes(store, make_proposal, ana):
    proposal = make_proposal(status="proposed")
    seen = []
    with events.isolated():
        events.subscribe("proposal.status_changed", lambda **payload: seen.append(payload))
        with pytest.raises(InvalidTransitionError):
            transition_proposal(store, str(proposal.pk), "booked", str(ana.pk))
    assert seen == []
    proposal.refresh_from_db()
    assert proposal.status == "proposed"


def test_a_failing_subscriber_rolls_the_transition_back(store, make_proposal, ana):
    proposal = make_proposal(status="proposed")

    def boom(**payload):
        raise RuntimeError("subscriber exploded")

    with events.isolated():
        events.subscribe("proposal.status_changed", boom)
        with pytest.raises(RuntimeError):
            transition_proposal(store, str(proposal.pk), "chosen", str(ana.pk))
    proposal.refresh_from_db()
    assert proposal.status == "proposed"
    assert proposal.chosen_at is None


@time_machine.travel(NOW, tick=False)
def test_side_effects_of_choosing_booking_and_discarding(store, make_proposal, ana):
    proposal = make_proposal(status="proposed")
    pid = str(proposal.pk)
    with events.isolated():
        chosen = transition_proposal(store, pid, "chosen", str(ana.pk))
        assert chosen.chosen_at == NOW and chosen.booked_at is None
        booked = transition_proposal(store, pid, "booked", str(ana.pk), booking_ref="ABC123")
        assert booked.booked_at == NOW and booked.booking_ref == "ABC123"
        unbooked = transition_proposal(store, pid, "chosen", str(ana.pk))
        assert unbooked.booked_at is None and unbooked.chosen_at == NOW
        discarded = transition_proposal(store, pid, "discarded", str(ana.pk))
        assert discarded.discarded_at == NOW
        reopened = transition_proposal(store, pid, "proposed", str(ana.pk))
        assert (reopened.chosen_at, reopened.booked_at, reopened.discarded_at) == (None, None, None)


def test_the_actor_may_be_none_for_system_transitions(store, make_proposal):
    proposal = make_proposal()
    seen = []
    with events.isolated():
        events.subscribe("proposal.status_changed", lambda **payload: seen.append(payload))
        transition_proposal(store, str(proposal.pk), "discarded", None)
    assert seen[0]["actor_id"] is None


def test_unknown_proposals_raise_lookup_error(store):
    with pytest.raises(LookupError):
        transition_proposal(store, "00000000-0000-0000-0000-000000000000", "chosen", None)
