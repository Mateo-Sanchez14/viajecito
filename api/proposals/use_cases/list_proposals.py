from collections.abc import Collection, Sequence
from dataclasses import dataclass

from proposals.domain import rules
from proposals.domain.classifier import CATEGORIES
from proposals.domain.status import OPEN_STATUSES, STATUSES, allowed_transitions
from proposals.domain.tally import Tally, compute_tally
from proposals.domain.types import ProposalRecord
from proposals.ports import ProposalStore
from proposals.use_cases.tally import in_person_ids

SORTS = ("recent", "score")
SUMMARY_TOP = 3


@dataclass(frozen=True)
class ProposalView:
    record: ProposalRecord
    tally: Tally
    allowed_transitions: list[str]


@dataclass(frozen=True)
class ProposalsSummary:
    counts: dict[str, int]
    top: list[ProposalView]


def build_views(
    store: ProposalStore, records: Sequence[ProposalRecord], viewer_id: str | None
) -> list[ProposalView]:
    """Attach tallies (one votes query, one electorate lookup per trip) and allowed moves."""
    votes = store.votes_for([r.id for r in records])
    electorates: dict[str, set[str]] = {}
    views = []
    for record in records:
        if record.trip_id not in electorates:
            electorates[record.trip_id] = in_person_ids(record.trip_id)
        tally = compute_tally(votes[record.id], electorates[record.trip_id], viewer_id)
        views.append(ProposalView(record, tally, allowed_transitions(record.status)))
    return views


def _check(values: Collection[str] | None, allowed: Collection[str], name: str) -> list[str]:
    values = list(values or [])
    unknown = [v for v in values if v not in allowed]
    if unknown:
        raise rules.InvalidProposalError("invalid_request", f"unknown {name} {unknown[0]!r}")
    return values


def list_proposals(
    store: ProposalStore,
    trip_id: str,
    viewer_id: str | None,
    *,
    categories: Collection[str] | None = None,
    statuses: Collection[str] | None = None,
    include_discarded: bool = False,
    sort: str = "recent",
) -> list[ProposalView]:
    """The trip's proposals (max 500). Without ``statuses`` discarded ones are hidden unless
    ``include_discarded``; ``sort`` is ``recent`` (newest first) or ``score`` (then newest)."""
    wanted_categories = _check(categories, CATEGORIES, "category")
    wanted_statuses = _check(statuses, STATUSES, "status")
    if sort not in SORTS:
        raise rules.InvalidProposalError("invalid_request", f"unknown sort {sort!r}")
    if not wanted_statuses:
        wanted_statuses = [s for s in STATUSES if include_discarded or s != "discarded"]
    elif include_discarded and "discarded" not in wanted_statuses:
        wanted_statuses.append("discarded")
    records = store.list_for_trip(
        trip_id, categories=wanted_categories or None, statuses=wanted_statuses
    )
    views = build_views(store, records, viewer_id)
    if sort == "score":
        views.sort(key=lambda view: -view.tally.score)  # stable: ties stay newest first
    return views


def get_proposal(store: ProposalStore, proposal_id: str, viewer_id: str | None) -> ProposalView:
    record = store.get(proposal_id)
    if record is None:
        raise LookupError(proposal_id)
    return build_views(store, [record], viewer_id)[0]


def top_open_proposals(
    store: ProposalStore, trip_id: str, viewer_id: str | None, limit: int
) -> list[ProposalView]:
    """The open proposals (proposed, discussing, chosen) by score; newest first on ties."""
    records = store.list_for_trip(trip_id, statuses=OPEN_STATUSES)
    views = build_views(store, records, viewer_id)
    views.sort(key=lambda view: -view.tally.score)
    return views[:limit]


def proposals_summary(
    store: ProposalStore, trip_id: str, viewer_id: str | None
) -> ProposalsSummary:
    records = store.list_for_trip(trip_id)
    counts = {status: 0 for status in STATUSES}
    for record in records:
        counts[record.status] += 1
    open_records = [r for r in records if r.status in OPEN_STATUSES]
    views = build_views(store, open_records, viewer_id)
    views.sort(key=lambda view: -view.tally.score)
    return ProposalsSummary(counts=counts, top=views[:SUMMARY_TOP])
