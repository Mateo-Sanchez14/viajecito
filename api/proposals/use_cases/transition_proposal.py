from datetime import datetime

from proposals.domain.rules import BOOKING_REF_MAX, clean_line
from proposals.domain.status import Stamps, apply_stamps, transition
from proposals.domain.types import ProposalRecord
from proposals.ports import ProposalStore
from shared import events
from shared.clock import SystemClock


def transition_proposal(
    store: ProposalStore,
    proposal_id: str,
    to: str,
    actor_id: str | None,
    *,
    booking_ref: str | None = None,
    now: datetime | None = None,
) -> ProposalRecord:
    """Move a proposal along the status graph and publish ``proposal.status_changed``.

    One atomic block: the write and the event (subscribers of Wave B run in the same transaction,
    and a failing one rolls the transition back). The same status is an idempotent no-op that
    publishes nothing. Raises ``LookupError`` for an unknown proposal and ``InvalidTransitionError``
    for an edge the graph does not have.
    """
    now = now or SystemClock().now()
    with store.atomic():
        current = store.get(proposal_id)
        if current is None:
            raise LookupError(proposal_id)
        step = transition(current.status, to)
        if step.noop:
            return current
        stamps = apply_stamps(
            Stamps(current.chosen_at, current.booked_at, current.discarded_at),
            current.status,
            to,
            now,
        )
        changes: dict[str, object] = {
            "status": to,
            "chosen_at": stamps.chosen_at,
            "booked_at": stamps.booked_at,
            "discarded_at": stamps.discarded_at,
        }
        if to == "booked" and booking_ref:
            changes["booking_ref"] = clean_line(booking_ref, BOOKING_REF_MAX)
        updated = store.update(proposal_id, changes)
        events.publish(
            "proposal.status_changed",
            proposal_id=proposal_id,
            trip_id=current.trip_id,
            from_status=current.status,
            to_status=to,
            actor_id=actor_id,
            occurred_at=now,
        )
        return updated
