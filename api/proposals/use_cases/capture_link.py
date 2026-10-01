import logging
from dataclasses import dataclass

from linkpreview.domain.urls import is_maps_short_link, normalize
from proposals.domain.types import ProposalRecord
from proposals.ports import (
    DuplicateProposalError,
    PreviewResolver,
    ProposalClassifier,
    ProposalStore,
)
from proposals.use_cases.add_comment import add_comment
from proposals.use_cases.cast_vote import ProposalClosedError, cast_vote
from proposals.use_cases.create_proposal import create_proposal

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CaptureResult:
    kind: str  # "created" | "existing" | "replay" (this very message already created it)
    proposal: ProposalRecord
    voted: bool = False  # a +1 was recorded for the sender
    commented: bool = False  # the text that came with the link was added as a comment


def capture_link(
    store: ProposalStore,
    *,
    trip_id: str,
    person_id: str,
    source_message_id: int | None,
    url: str,
    note: str,
    resolve_preview: PreviewResolver,
    classifier: ProposalClassifier,
    llm: ProposalClassifier | None = None,
) -> CaptureResult:
    """One link dropped in the group: dedupe on ``(trip, canonical URL)`` or create a proposal.

    ``url`` has its tracking parameters stripped already. An existing proposal gets the sender's
    +1 (unless they voted) and the accompanying text as a comment; a replay of the message that
    created the proposal changes nothing.
    """
    if store.trip_ref(trip_id) is None:
        raise LookupError(trip_id)
    if not is_maps_short_link(url):  # no fetch for a link whose canonical form is already known
        existing = store.find_by_canonical(trip_id, normalize(url))
        if existing is not None:
            return _existing(store, existing, person_id, source_message_id, note)
    preview = resolve_preview(url)
    existing = store.find_by_canonical(trip_id, preview.canonical_url)
    if existing is not None:
        return _existing(store, existing, person_id, source_message_id, note)
    try:
        created = create_proposal(
            store,
            trip_id=trip_id,
            author_id=person_id,
            classifier=classifier,
            llm=llm,
            url=url,
            canonical_url=preview.canonical_url,
            preview=preview,
            note=note,
            source_message_id=source_message_id,
        )
    except DuplicateProposalError as duplicate:  # lost a race with another message
        existing = store.get(duplicate.proposal_id)
        assert existing is not None
        return _existing(store, existing, person_id, source_message_id, note)
    return CaptureResult("created", created)


def _existing(
    store: ProposalStore,
    proposal: ProposalRecord,
    person_id: str,
    source_message_id: int | None,
    note: str,
) -> CaptureResult:
    if source_message_id is not None and proposal.source_message_id == source_message_id:
        return CaptureResult("replay", proposal)
    voted = commented = False
    with store.atomic():
        if not store.has_voted(proposal.id, person_id):
            try:
                cast_vote(store, proposal.id, person_id, 1, source_message_id=source_message_id)
                voted = True
            except ProposalClosedError:
                logger.info("proposal %s is discarded: no automatic +1", proposal.id)
        if note:
            add_comment(store, proposal.id, person_id, note, source_message_id=source_message_id)
            commented = True
    return CaptureResult("existing", store.get(proposal.id) or proposal, voted, commented)
