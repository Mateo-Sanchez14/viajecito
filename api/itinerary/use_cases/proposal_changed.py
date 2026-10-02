"""Copy proposal choices through published snapshot bridges, never another app's models."""

from itinerary.domain import in_range
from itinerary.ports import default_store
from proposals.use_cases.get_proposal_snapshot import get_proposal_snapshot
from trips.use_cases.get_trip_snapshot import get_trip_snapshot

CATEGORY_KIND = {
    "lodging": "lodging",
    "transport": "transport",
    "food": "meal",
    "activity": "activity",
    "gear": "other",
    "destination": "activity",
    "other": "other",
}


def on_proposal_status_changed(
    *, proposal_id, trip_id, from_status, to_status, actor_id, occurred_at
):
    store = default_store()
    if to_status in ("chosen", "booked"):
        proposal = get_proposal_snapshot(proposal_id)
        trip = get_trip_snapshot(trip_id)
        if proposal is None or trip is None or proposal.trip_id != trip_id:
            return
        preview = proposal.preview
        day = (
            proposal.starts_on
            if proposal.starts_on and in_range(trip, proposal.starts_on)
            else None
        )
        fields = dict(
            title=proposal.title[:200],
            kind=CATEGORY_KIND.get(proposal.category, "other"),
            location_label=((preview.site_name or preview.title) if preview else "")[:200],
            lat=preview.lat if preview else None,
            lng=preview.lng if preview else None,
        )
        store.copy_proposal(proposal_id, trip_id, actor_id, day, fields)
    elif to_status in ("proposed", "discussing", "discarded"):
        store.remove_tray_proposal(proposal_id)
