import logging

from proposals.domain.classifier import CATEGORIES, Classification, ClassificationInput
from proposals.ports import ProposalClassifier

logger = logging.getLogger(__name__)

LLM_BELOW_CONFIDENCE = 0.5


def classify_with_fallback(
    rules: ProposalClassifier,
    llm: ProposalClassifier | None,
    data: ClassificationInput,
    text: str,
) -> Classification:
    """The rule-based result, improved by the LLM only when the rules are unsure (< 0.5).

    Any LLM failure or unusable answer keeps the rule result.
    """
    result = rules.classify(data, text)
    if llm is None or result.confidence >= LLM_BELOW_CONFIDENCE:
        return result
    try:
        answer = llm.classify(data, text)
    except Exception:
        logger.warning("LLM classifier failed; keeping the rule-based result", exc_info=True)
        return result
    return answer if answer.category in CATEGORIES else result
