"""Composition root of proposals: the classifiers and the shared collaborators."""

from proposals import conf
from proposals.adapters.django_store import DjangoProposalStore
from proposals.domain.classifier import RuleBasedClassifier
from proposals.ports import ProposalClassifier


def store() -> DjangoProposalStore:
    return DjangoProposalStore()


def rules_classifier() -> RuleBasedClassifier:
    return RuleBasedClassifier()


def llm_classifier() -> ProposalClassifier | None:
    """The optional LLM classifier: only when enabled and configured (off in dev and tests)."""
    if not (conf.llm_classifier_enabled() and conf.llm_base_url() and conf.llm_model()):
        return None
    from proposals.adapters.llm_classifier import LlmClassifier

    return LlmClassifier(conf.llm_base_url(), conf.llm_api_key(), conf.llm_model())
