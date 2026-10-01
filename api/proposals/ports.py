"""Ports of the proposals app (pure: no Django, no HTTP)."""

from collections.abc import Callable, Collection
from contextlib import AbstractContextManager
from typing import Any, Protocol

from proposals.domain.classifier import Classification, ClassificationInput
from proposals.domain.types import (
    CommentRecord,
    NewProposal,
    PreviewSummary,
    ProposalRecord,
    TripRef,
)


class ProposalClassifier(Protocol):
    def classify(self, data: ClassificationInput, text: str) -> Classification:
        """Pick a category for a link. May raise: callers fall back to the rule-based result."""
        ...


class DuplicateProposalError(Exception):
    """The trip already has a proposal for this canonical URL."""

    def __init__(self, proposal_id: str) -> None:
        super().__init__(proposal_id)
        self.proposal_id = proposal_id


class ProposalStore(Protocol):
    def atomic(self) -> AbstractContextManager[None]: ...

    def trip_ref(self, trip_id: str) -> TripRef | None: ...

    def create(self, new: NewProposal) -> ProposalRecord:
        """Raises ``DuplicateProposalError`` when ``(trip, canonical_url)`` already exists."""
        ...

    def get(self, proposal_id: str) -> ProposalRecord | None: ...

    def find_by_canonical(self, trip_id: str, canonical_url: str) -> ProposalRecord | None: ...

    def list_for_trip(
        self,
        trip_id: str,
        *,
        categories: Collection[str] | None = None,
        statuses: Collection[str] | None = None,
    ) -> list[ProposalRecord]: ...

    def update(self, proposal_id: str, changes: dict[str, Any]) -> ProposalRecord: ...

    def votes_for(self, proposal_ids: list[str]) -> dict[str, list[tuple[str, int]]]:
        """``{proposal_id: [(person_id, value)]}`` (proposals without votes map to ``[]``)."""
        ...

    def set_vote(
        self, proposal_id: str, person_id: str, value: int, source_message_id: int | None
    ) -> None: ...

    def delete_vote(self, proposal_id: str, person_id: str) -> None: ...

    def has_voted(self, proposal_id: str, person_id: str) -> bool: ...

    def add_comment(
        self, proposal_id: str, author_id: str, body: str, source_message_id: int | None
    ) -> CommentRecord: ...

    def get_comment(self, comment_id: str) -> tuple[CommentRecord, str] | None:
        """The comment and the id of the trip of its proposal."""
        ...

    def delete_comment(self, comment_id: str) -> None: ...

    def list_comments(self, proposal_id: str) -> list[CommentRecord]: ...

    def proposals_of_preview(self, preview_id: str) -> list[ProposalRecord]: ...

    def read_thumbnail(self, proposal_id: str) -> bytes | None:
        """The WebP bytes of the proposal's link preview thumbnail, if it has one."""
        ...


PreviewResolver = Callable[[str], PreviewSummary]
"""Resolves a (tracking-free) URL into its stored preview, unfurling it when needed."""


_default_factory: Callable[[], ProposalStore] | None = None


def set_default_store(factory: Callable[[], ProposalStore]) -> None:
    """Composition root hook installed by ``ProposalsConfig.ready()``."""
    global _default_factory
    _default_factory = factory


def default_store() -> ProposalStore:
    if _default_factory is None:
        raise RuntimeError("no default proposal store configured (is the proposals app installed?)")
    return _default_factory()
