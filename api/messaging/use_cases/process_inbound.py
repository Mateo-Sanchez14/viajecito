"""Process one stored inbound message: resolve the sender, then run the handler chain."""

import logging
from collections.abc import Sequence
from datetime import timedelta

from messaging.handlers.types import Handler, HandlerContext
from messaging.ports import GatewayError, ProcessStore, Replier, RosterSync, SenderResolver
from messaging.router import route
from shared.clock import Clock

logger = logging.getLogger(__name__)

MAX_ERROR_CHARS = 500


def process_inbound(
    inbound_id: int,
    *,
    store: ProcessStore,
    senders: SenderResolver,
    roster: RosterSync,
    replier: Replier,
    handlers: Sequence[Handler],
    clock: Clock,
    roster_min_interval: timedelta = timedelta(seconds=300),
    max_attempts: int = 3,
) -> str:
    """Return the final status, or ``"skipped"`` when the row was not ``received``.

    The sender must be an ACTIVE member of the crew linked to the chat. Handler and gateway
    failures are recorded on the row and never raised.
    """
    record = store.claim(inbound_id, clock.now())
    if record is None:
        return "skipped"
    person_id: str | None = None
    try:
        crew_id = roster.crew_id_for_chat(record.chat_id)
        if crew_id is None:
            return _finish(store, clock, inbound_id, "ignored", {"reason": "unlinked_group"})

        def lookup() -> tuple[str | None, bool]:
            found = senders.person_id_for(record.sender_jid, record.sender_lid)
            return found, found is not None and roster.is_active_member(crew_id, found)

        person_id, is_member = lookup()
        if not is_member:  # maybe a new participant: refresh the roster (rate limited) and retry
            last = roster.roster_last_synced_at(crew_id)
            if last is None or clock.now() - last >= roster_min_interval:
                roster.sync_roster(crew_id)
                person_id, is_member = lookup()
        if not is_member:
            reason = "unknown_sender" if person_id is None else "not_a_member"
            return _finish(store, clock, inbound_id, "ignored", {"reason": reason}, person_id)
        ctx = HandlerContext(
            message=record,
            person_id=person_id,
            crew_id=crew_id,
            reply_allowed=lambda: replier.can_reply(record.chat_id),
            reply=lambda body: replier.reply(
                chat_id=record.chat_id,
                body=body,
                reply_to=record.gowa_message_id,
                inbound_id=record.id,
            ),
        )
        handled = route(ctx, handlers)
        outcome = (
            {"handler": handled.handler, **handled.detail} if handled else {"reason": "no_handler"}
        )
        return _finish(store, clock, inbound_id, "done", outcome, person_id)
    except GatewayError as exc:
        logger.warning("inbound %s: gateway unavailable: %s", inbound_id, exc)
        if record.attempts < max_attempts:  # the tick retries it
            return _finish(store, clock, inbound_id, "received", {}, person_id, str(exc))
        return _finish(
            store, clock, inbound_id, "ignored", {"reason": "roster_unavailable"}, person_id
        )
    except Exception as exc:
        logger.exception("inbound %s failed", inbound_id)
        error = f"{exc.__class__.__name__}: {exc}"[:MAX_ERROR_CHARS]
        return _finish(store, clock, inbound_id, "failed", {}, person_id, error)


def _finish(
    store: ProcessStore,
    clock: Clock,
    inbound_id: int,
    status: str,
    outcome: dict,
    person_id: str | None = None,
    error: str = "",
) -> str:
    store.finish(
        inbound_id,
        status=status,
        outcome=outcome,
        error=error[:MAX_ERROR_CHARS],
        person_id=person_id,
        now=clock.now(),
    )
    return status
