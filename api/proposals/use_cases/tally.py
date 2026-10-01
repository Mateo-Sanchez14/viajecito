from proposals.domain.tally import Tally, compute_tally
from proposals.domain.types import ProposalRecord
from proposals.ports import ProposalStore
from trips.use_cases.trip_participants import trip_participants


def in_person_ids(trip_id: str) -> set[str]:
    """The people whose RSVP for the trip is ``in`` (the electorate of the majority rule)."""
    return {p.person_id for p in trip_participants(trip_id) if p.rsvp == "in"}


def tally_for(store: ProposalStore, proposal: ProposalRecord, viewer_id: str | None) -> Tally:
    votes = store.votes_for([proposal.id])[proposal.id]
    return compute_tally(votes, in_person_ids(proposal.trip_id), viewer_id)
