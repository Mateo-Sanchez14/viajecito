from datetime import timedelta

from crews.use_cases.active_member_ids import active_member_ids
from logistics.copy.es_ar import BOOKING_TASK_TITLE
from proposals.use_cases.get_proposal_snapshot import get_proposal_snapshot
from trips.use_cases.get_trip_snapshot import get_trip_snapshot


def react_to_proposal(store, *, proposal_id, trip_id, to_status, actor_id, occurred_at, **_):
    proposal = get_proposal_snapshot(proposal_id)
    trip = get_trip_snapshot(trip_id)
    if proposal is None or trip is None or proposal.trip_id != trip_id:
        return
    actor = actor_id if actor_id in active_member_ids(trip.crew_id) else None
    with store.atomic():
        task = store.booking_for(proposal_id)
        if to_status in ("chosen", "booked"):
            if task is None:
                dates = [d for d in (proposal.starts_on, trip.start_on) if d]
                task = store.create(
                    trip_id,
                    None,
                    {
                        "kind": "booking",
                        "title": BOOKING_TASK_TITLE.format(title=proposal.title)[:200],
                        "owner_id": actor,
                        "due_on": min(dates) - timedelta(days=14) if dates else None,
                        "proposal_id": proposal_id,
                        "source": "proposal",
                    },
                )
            changes = {}
            if to_status == "booked":
                changes = {"status": "done", "done_at": occurred_at, "done_by_id": actor}
            elif task["status"] == "done":
                changes = {"status": "open", "done_at": None, "done_by_id": None}
            if changes:
                store.update(task["id"], changes)
        elif task and task["source"] == "proposal" and task["status"] == "open":
            store.delete(task["id"])
