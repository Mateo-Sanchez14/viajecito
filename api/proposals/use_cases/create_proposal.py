from datetime import date
from decimal import Decimal

from linkpreview.domain.urls import slug_title
from proposals.domain import rules
from proposals.domain.classifier import ClassificationInput
from proposals.domain.types import NewProposal, PreviewSummary, ProposalRecord
from proposals.ports import ProposalClassifier, ProposalStore
from proposals.use_cases.classify import classify_with_fallback

USABLE_PREVIEW = ("ok", "partial")


def _usable(preview: PreviewSummary | None) -> bool:
    return preview is not None and preview.fetch_status in USABLE_PREVIEW


def preview_title(preview: PreviewSummary | None, url: str | None) -> str:
    """The preview's title, else a readable slug of the URL, else empty."""
    if _usable(preview) and preview.title:
        return preview.title
    return slug_title(url) if url else ""


def classification_input(
    url: str, title: str, preview: PreviewSummary | None
) -> ClassificationInput:
    return ClassificationInput(
        url=(preview.final_url if preview and preview.final_url else url),
        title=title,
        description=preview.description if preview else "",
        site_name=preview.site_name if preview else "",
        has_coordinates=bool(preview and preview.lat is not None),
    )


def create_proposal(
    store: ProposalStore,
    *,
    trip_id: str,
    author_id: str,
    classifier: ProposalClassifier,
    llm: ProposalClassifier | None = None,
    url: str | None = None,
    canonical_url: str | None = None,
    preview: PreviewSummary | None = None,
    title: str | None = None,
    category: str | None = None,
    note: str = "",
    est_price: str | Decimal | None = None,
    currency: str | None = None,
    price_basis: str = "total",
    starts_on: date | None = None,
    ends_on: date | None = None,
    source_message_id: int | None = None,
) -> ProposalRecord:
    """Validate, classify and store a new proposal.

    ``url`` is the tracking-free link (when there is one) and ``canonical_url`` its dedupe key; a
    taken key raises ``DuplicateProposalError``. A preview price fills ``est_price`` only when the
    caller gave none. Raises ``InvalidProposalError`` for unacceptable input and ``LookupError``
    for an unknown trip.
    """
    trip = store.trip_ref(trip_id)
    if trip is None:
        raise LookupError(trip_id)
    if not (url or (title and title.strip())):
        raise rules.InvalidProposalError("invalid_request", "a url or a title is required")
    chosen_title = rules.validate_title(title) if title and title.strip() else None
    chosen_title = chosen_title or rules.validate_title(preview_title(preview, url))
    price = rules.parse_price(est_price)
    rules.validate_dates(starts_on, ends_on)
    basis = rules.validate_price_basis(price_basis)
    chosen_currency = rules.normalize_currency(currency) if currency else None

    if category:
        chosen_category, classified_by = rules.validate_category(category), "user"
    else:
        result = classify_with_fallback(
            classifier, llm, classification_input(url or "", chosen_title, preview), note
        )
        chosen_category, classified_by = result.category, result.source

    if price is None and _usable(preview) and preview.price_amount is not None:
        price = rules.parse_price(preview.price_amount)
        chosen_currency = chosen_currency or preview.price_currency or None
    new = NewProposal(
        trip_id=trip_id,
        author_id=author_id,
        title=chosen_title,
        category=chosen_category,
        classified_by=classified_by,
        note=rules.clean_block(note, rules.NOTE_MAX),
        link_preview_id=preview.id if preview else None,
        canonical_url=canonical_url,
        est_price=price,
        price_basis=basis,
        currency=chosen_currency or trip.currency,
        starts_on=starts_on,
        ends_on=ends_on,
        source_message_id=source_message_id,
    )
    return store.create(new)
