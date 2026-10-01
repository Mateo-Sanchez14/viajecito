from dataclasses import dataclass
from datetime import datetime

from proposals.domain.rules import InvalidProposalError
from proposals.domain.tally import Tally
from proposals.domain.types import ProposalRecord
from proposals.ports import ProposalStore
from proposals.use_cases.tally import tally_for
from proposals.use_cases.transition_proposal import transition_proposal


class ProposalClosedError(Exception):
    """The proposal is discarded: it takes no more votes until it is reopened."""


@dataclass(frozen=True)
class VoteOutcome:
    proposal: ProposalRecord
    tally: Tally


def cast_vote(
    store: ProposalStore,
    proposal_id: str,
    person_id: str,
    value: int,
    *,
    source_message_id: int | None = None,
    now: datetime | None = None,
) -> VoteOutcome:
    """Record (or change) a person's vote. The first non-zero vote on a ``proposed`` proposal moves
    it to ``discussing``."""
    if value not in (-1, 0, 1):
        raise InvalidProposalError("invalid_request", "vote value must be -1, 0 or 1")
    with store.atomic():
        proposal = store.get(proposal_id)
        if proposal is None:
            raise LookupError(proposal_id)
        if proposal.status == "discarded":
            raise ProposalClosedError(proposal_id)
        store.set_vote(proposal_id, person_id, value, source_message_id)
        if value != 0 and proposal.status == "proposed":
            proposal = transition_proposal(store, proposal_id, "discussing", person_id, now=now)
    return VoteOutcome(proposal, tally_for(store, proposal, person_id))


def remove_vote(store: ProposalStore, proposal_id: str, person_id: str) -> VoteOutcome:
    """Withdraw a person's vote (idempotent)."""
    with store.atomic():
        proposal = store.get(proposal_id)
        if proposal is None:
            raise LookupError(proposal_id)
        store.delete_vote(proposal_id, person_id)
    return VoteOutcome(proposal, tally_for(store, proposal, person_id))
