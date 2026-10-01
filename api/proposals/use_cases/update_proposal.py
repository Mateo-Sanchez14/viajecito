from typing import Any

from proposals.domain import rules
from proposals.domain.types import ProposalRecord
from proposals.ports import ProposalStore

EDITABLE = (
    "title",
    "note",
    "category",
    "est_price",
    "currency",
    "price_basis",
    "starts_on",
    "ends_on",
    "booking_ref",
)


def update_proposal(
    store: ProposalStore, proposal_id: str, changes: dict[str, Any]
) -> ProposalRecord:
    """Apply a partial edit (only the keys present). ``est_price``, dates and ``booking_ref`` may
    be cleared with ``None``; editing the category marks it as the user's choice. Dates are
    validated after merging with the stored ones."""
    with store.atomic():
        current = store.get(proposal_id)
        if current is None:
            raise LookupError(proposal_id)
        clean: dict[str, Any] = {}
        for key in EDITABLE:
            if key not in changes:
                continue
            value = changes[key]
            if key in ("title", "category", "currency", "price_basis", "note") and value is None:
                raise rules.InvalidProposalError("invalid_request", f"{key} cannot be null")
            if key == "title":
                clean[key] = rules.validate_title(value)
            elif key == "note":
                clean[key] = rules.clean_block(value, rules.NOTE_MAX)
            elif key == "category":
                clean[key] = rules.validate_category(value)
                clean["classified_by"] = "user"
            elif key == "est_price":
                clean[key] = rules.parse_price(value)
            elif key == "currency":
                clean[key] = rules.normalize_currency(value)
            elif key == "price_basis":
                clean[key] = rules.validate_price_basis(value)
            elif key == "booking_ref":
                clean[key] = rules.clean_line(value or "", rules.BOOKING_REF_MAX)
            else:
                clean[key] = value
        rules.validate_dates(
            clean.get("starts_on", current.starts_on), clean.get("ends_on", current.ends_on)
        )
        if not clean:
            return current
        return store.update(proposal_id, clean)
