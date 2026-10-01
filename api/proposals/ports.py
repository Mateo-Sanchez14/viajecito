"""Ports of the proposals app (pure: no Django, no HTTP)."""

from typing import Protocol

from proposals.domain.classifier import Classification, ClassificationInput


class ProposalClassifier(Protocol):
    def classify(self, data: ClassificationInput, text: str) -> Classification:
        """Pick a category for a link. May raise: callers fall back to the rule-based result."""
        ...
