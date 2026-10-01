"""A link dropped in the group becomes a proposal card (handler order 30)."""

import logging
from urllib.parse import urlsplit

from crews import ports as crews_ports
from crews.use_cases.crews_for import crews_for
from identity.use_cases.display_names import display_names
from linkpreview.domain.urls import extract_urls, strip_tracking, text_without_urls
from messaging.handlers.types import Handled, HandlerContext
from proposals import conf
from proposals.adapters import previews, wiring
from proposals.copy import es_ar
from proposals.domain.card import CardSnapshot, clean_title, format_card
from proposals.domain.types import ProposalRecord
from proposals.use_cases.capture_link import CaptureResult, capture_link
from trips.use_cases.default_trip_for_crew import default_trip_for_crew

logger = logging.getLogger(__name__)
HANDLER = "link_capture"


def _host(url: str) -> str:
    return (urlsplit(url).hostname or "").lower() if url else ""


def _ignored_hosts(ctx: HandlerContext) -> list[str]:
    """Hosts that are not proposal sources: this app and the crew's gastito."""
    hosts = [_host(conf.public_origin())]
    for crew in crews_for(ctx.person_id, crews_ports.default_store()):
        if crew.id == ctx.crew_id and crew.gastito_group_url:
            hosts.append(_host(crew.gastito_group_url))
    return hosts


def handle(ctx: HandlerContext) -> Handled | None:
    """Claims a message only when it holds at least one non-ignored URL."""
    extraction = extract_urls(ctx.message.body, ignored_hosts=_ignored_hosts(ctx))
    if not extraction.urls:
        return None
    trip_id = default_trip_for_crew(ctx.crew_id)
    if trip_id is None:
        text = es_ar.NO_ACTIVE_TRIP.format(url=conf.public_origin())
        return Handled(HANDLER, {"reason": "no_trip", **_reply(ctx, [text])})

    note = text_without_urls(ctx.message.body)
    created: list[str] = []
    existing: list[CaptureResult] = []
    cards = {"sent": 0, "failed": 0}
    errors = 0
    for url in extraction.urls:
        try:
            result = capture_link(
                wiring.store(),
                trip_id=trip_id,
                person_id=ctx.person_id,
                source_message_id=ctx.message.id,
                url=strip_tracking(url),
                note=note,
                resolve_preview=previews.resolve,
                classifier=wiring.rules_classifier(),
                llm=wiring.llm_classifier(),
            )
        except Exception:  # one broken link must not lose the others
            logger.exception("capturing %s failed", url)
            errors += 1
            continue
        if result.kind == "existing":
            existing.append(result)
            continue
        created.append(result.proposal.id)
        status = _send_card(ctx, result.proposal)
        cards["sent" if status in ("sent", "duplicate") else "failed"] += 1

    lines = _existing_lines(existing)
    if extraction.overflow:
        lines.append(es_ar.TOO_MANY_LINKS)
    detail: dict = {
        "created": created,
        "existing": [r.proposal.id for r in existing],
        "ignored_urls": extraction.ignored + extraction.overflow,
    }
    if cards["failed"]:
        detail["cards"] = cards
    if errors:
        detail["errors"] = errors
    if lines:
        detail.update(_reply(ctx, lines))
    return Handled(HANDLER, detail)


def _reply(ctx: HandlerContext, lines: list[str]) -> dict[str, str]:
    """One threaded reply per inbound message (the ledger allows exactly one)."""
    if not ctx.reply_allowed():
        return {"reply": "throttled"}
    return {"reply": ctx.reply("\n".join(lines))}


def _existing_lines(existing: list[CaptureResult]) -> list[str]:
    if not existing:
        return []
    names = display_names([r.proposal.author_id for r in existing])
    return [
        (es_ar.ALREADY_THERE if r.voted else es_ar.ALREADY_THERE_VOTED).format(
            author=clean_title(names.get(r.proposal.author_id, ""))
        )
        for r in existing
    ]


def _send_card(ctx: HandlerContext, proposal: ProposalRecord) -> str:
    snapshot = CardSnapshot(
        title=proposal.title,
        category=proposal.category,
        est_price=proposal.est_price,
        currency=proposal.currency,
        price_basis=proposal.price_basis,
        site_name=proposal.preview.site_name if proposal.preview else "",
    )
    body = format_card(snapshot, f"{conf.public_origin()}{proposal.web_path}")
    card = ctx.send_card(
        body,
        subject_type="proposal",
        subject_id=proposal.id,
        dedupe_key=f"card:proposal:{proposal.id}",
    )
    return card.status
