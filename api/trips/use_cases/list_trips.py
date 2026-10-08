from trips.domain import MEMBERS_PREVIEW_LIMIT, TripListing
from trips.ports import TripStore


def list_trips(crew_id: str, store: TripStore) -> TripListing:
    """The crew's trips with its member count and a short member preview (two queries for the
    roster, regardless of how many trips there are)."""
    member_count, members_preview = store.member_summary(crew_id, MEMBERS_PREVIEW_LIMIT)
    return TripListing(
        trips=store.list_for_crew(crew_id),
        member_count=member_count,
        members_preview=members_preview,
    )
