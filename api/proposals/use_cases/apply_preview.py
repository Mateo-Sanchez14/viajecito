from linkpreview.domain.urls import slug_title
from proposals.domain import rules
from proposals.domain.types import PreviewSummary
from proposals.ports import ProposalClassifier, ProposalStore
from proposals.use_cases.classify import classify_with_fallback
from proposals.use_cases.create_proposal import classification_input


def apply_preview(
    store: ProposalStore,
    preview: PreviewSummary,
    classifier: ProposalClassifier,
    llm: ProposalClassifier | None = None,
) -> int:
    """A preview finished unfurling: fill in what the proposals built on it could not know yet.

    A title that is still the URL slug is replaced by the real one, a missing price is copied, and
    a category that only the rules chose is re-evaluated with the page's content. Anything a person
    typed or edited is left alone. Returns the number of proposals changed.
    """
    if preview.fetch_status not in ("ok", "partial"):
        return 0
    placeholders = {
        slug_title(url) for url in (preview.url, preview.final_url, preview.canonical_url) if url
    }
    changed = 0
    for proposal in store.proposals_of_preview(preview.id):
        updates: dict[str, object] = {}
        title = proposal.title
        if preview.title and title in placeholders:
            title = rules.validate_title(preview.title)
            updates["title"] = title
        if proposal.est_price is None and preview.price_amount is not None:
            price = rules.parse_price(preview.price_amount)
            if price is not None:
                updates["est_price"] = price
                updates["currency"] = preview.price_currency or proposal.currency
        if proposal.classified_by in ("rules", "llm"):
            result = classify_with_fallback(
                classifier,
                llm,
                classification_input(preview.url, title, preview),
                proposal.note,
            )
            if result.confidence > 0 and result.category != proposal.category:
                updates["category"] = result.category
                updates["classified_by"] = result.source
        if updates:
            store.update(proposal.id, updates)
            changed += 1
    return changed
