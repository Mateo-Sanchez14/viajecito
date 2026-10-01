from proposals import ports
from proposals.domain.types import ProposalRecord
from proposals.ports import ProposalStore


def get_proposal_snapshot(
    proposal_id: str, *, store: ProposalStore | None = None
) -> ProposalRecord | None:
    """Read a proposal for trusted cross-app callers; authorization belongs to the caller."""
    resolved = store if store is not None else ports.default_store()
    return resolved.get(proposal_id)
