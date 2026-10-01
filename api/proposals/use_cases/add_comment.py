from datetime import datetime

from proposals.domain.rules import validate_comment
from proposals.domain.types import CommentRecord
from proposals.ports import ProposalStore
from proposals.use_cases.transition_proposal import transition_proposal


def add_comment(
    store: ProposalStore,
    proposal_id: str,
    author_id: str,
    body: str,
    *,
    source_message_id: int | None = None,
    now: datetime | None = None,
) -> CommentRecord:
    """Comment on a proposal; the first comment on a ``proposed`` one starts the discussion."""
    text = validate_comment(body)
    with store.atomic():
        proposal = store.get(proposal_id)
        if proposal is None:
            raise LookupError(proposal_id)
        comment = store.add_comment(proposal_id, author_id, text, source_message_id)
        if proposal.status == "proposed":
            transition_proposal(store, proposal_id, "discussing", author_id, now=now)
    return comment
