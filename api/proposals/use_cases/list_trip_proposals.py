from collections.abc import Collection

from proposals import ports
from proposals.domain.types import ProposalRecord
from proposals.ports import ProposalStore


def list_trip_proposals(
    trip_id: str,
    statuses: Collection[str] | None = None,
    *,
    store: ProposalStore | None = None,
) -> list[ProposalRecord]:
    """Read up to 500 newest proposals; authorization belongs to the trusted caller."""
    resolved = store if store is not None else ports.default_store()
    return resolved.list_for_trip(trip_id, statuses=statuses)
