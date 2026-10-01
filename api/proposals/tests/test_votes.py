import pytest

from proposals.domain.status import OPEN_STATUSES  # noqa: F401
from proposals.models import Comment, Vote
from proposals.use_cases.add_comment import add_comment
from proposals.use_cases.cast_vote import ProposalClosedError, cast_vote, remove_vote
from shared import events

pytestmark = pytest.mark.django_db


def test_one_vote_per_person_and_revoting_updates_the_row(store, make_proposal, ana):
    proposal = make_proposal()
    pid, me = str(proposal.pk), str(ana.pk)
    cast_vote(store, pid, me, 1)
    outcome = cast_vote(store, pid, me, -1)
    assert Vote.objects.filter(proposal=proposal).count() == 1
    assert (outcome.tally.up, outcome.tally.down, outcome.tally.my_vote) == (0, 1, -1)


def test_remove_vote_is_idempotent(store, make_proposal, ana):
    proposal = make_proposal()
    pid, me = str(proposal.pk), str(ana.pk)
    cast_vote(store, pid, me, 1)
    assert remove_vote(store, pid, me).tally.my_vote is None
    assert remove_vote(store, pid, me).tally.up == 0
    assert not Vote.objects.exists()


def test_the_tally_counts_everyone_and_the_majority_only_counts_in(
    store, make_proposal, ana, beto, cris, trip
):
    from trips.models import Participation

    Participation.objects.filter(trip=trip, person=cris).update(rsvp="out")
    proposal = make_proposal()
    pid = str(proposal.pk)
    cast_vote(store, pid, str(ana.pk), 1)
    outcome = cast_vote(store, pid, str(cris.pk), 1)
    # Ana is in, Cris is out: 2 up in total, but only 1 of the 2 `in` people voted +1.
    assert (outcome.tally.up, outcome.tally.majority) == (2, False)
    outcome = cast_vote(store, pid, str(beto.pk), 1)
    assert (outcome.tally.up, outcome.tally.up_in, outcome.tally.majority) == (3, 2, True)


def test_voting_on_a_discarded_proposal_is_refused(store, make_proposal, ana):
    proposal = make_proposal(status="discarded")
    with pytest.raises(ProposalClosedError):
        cast_vote(store, str(proposal.pk), str(ana.pk), 1)
    assert not Vote.objects.exists()


def test_the_vote_remembers_the_whatsapp_message_it_came_from(store, make_proposal, ana):
    from messaging.models import InboundMessage

    message = InboundMessage.objects.create(
        device_id="d", gowa_message_id="m1", event="message", chat_id="c@g.us"
    )
    proposal = make_proposal()
    cast_vote(store, str(proposal.pk), str(ana.pk), 1, source_message_id=message.pk)
    assert Vote.objects.get().source_message_id == message.pk


# --- the first reaction moves a proposal to `discussing` ---------------------------------------


def test_the_first_non_zero_vote_moves_a_proposed_proposal_to_discussing(store, make_proposal, ana):
    proposal = make_proposal()
    seen = []
    with events.isolated():
        events.subscribe("proposal.status_changed", lambda **payload: seen.append(payload))
        outcome = cast_vote(store, str(proposal.pk), str(ana.pk), 1)
    assert outcome.proposal.status == "discussing"
    assert [(e["from_status"], e["to_status"], e["actor_id"]) for e in seen] == [
        ("proposed", "discussing", str(ana.pk))
    ]


def test_a_zero_vote_does_not_start_the_discussion(store, make_proposal, ana):
    proposal = make_proposal()
    assert cast_vote(store, str(proposal.pk), str(ana.pk), 0).proposal.status == "proposed"


def test_further_votes_do_not_change_other_statuses(store, make_proposal, ana, beto):
    chosen = make_proposal(status="chosen", title="x")
    assert cast_vote(store, str(chosen.pk), str(ana.pk), -1).proposal.status == "chosen"
    discussing = make_proposal(status="discussing", title="y")
    seen = []
    with events.isolated():
        events.subscribe("proposal.status_changed", lambda **payload: seen.append(payload))
        cast_vote(store, str(discussing.pk), str(beto.pk), 1)
    assert seen == []


def test_the_first_comment_moves_a_proposed_proposal_to_discussing(store, make_proposal, beto):
    proposal = make_proposal()
    seen = []
    with events.isolated():
        events.subscribe("proposal.status_changed", lambda **payload: seen.append(payload))
        comment = add_comment(store, str(proposal.pk), str(beto.pk), "  me copa  ")
    assert comment.body == "me copa"
    assert Comment.objects.count() == 1
    proposal.refresh_from_db()
    assert proposal.status == "discussing"
    assert seen[0]["actor_id"] == str(beto.pk)


def test_comments_are_validated(store, make_proposal, beto):
    from proposals.domain.rules import InvalidProposalError

    proposal = make_proposal()
    for body in ("", "   ", "x" * 2001):
        with pytest.raises(InvalidProposalError):
            add_comment(store, str(proposal.pk), str(beto.pk), body)
    assert Comment.objects.count() == 0
    add_comment(store, str(proposal.pk), str(beto.pk), "x" * 2000)
    assert Comment.objects.count() == 1


def test_comments_on_a_discarded_proposal_are_allowed_and_keep_it_discarded(
    store, make_proposal, beto
):
    proposal = make_proposal(status="discarded")
    add_comment(store, str(proposal.pk), str(beto.pk), "una pena")
    proposal.refresh_from_db()
    assert proposal.status == "discarded"
