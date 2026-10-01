"""Process one stored inbound message: resolve the sender, then run the handler chain."""

import logging
from collections.abc import Sequence

from messaging.handlers.types import Handler, HandlerContext
from messaging.ports import ProcessStore, Replier, RosterSync, SenderResolver
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
) -> str:
    """Return the final status, or ``"skipped"`` when the row was not ``received``.

    Handler and gateway failures are recorded on the row (``failed``) and never raised.
    """
    record = store.claim(inbound_id, clock.now())
    if record is None:
        return "skipped"
    person_id: str | None = None
    try:
        person_id = senders.person_id_for(record.sender_jid, record.sender_lid)
        if person_id is None:  # a member we have not seen yet: refresh the roster once and retry
            crew_id = roster.crew_id_for_chat(record.chat_id)
            if crew_id is not None:
                roster.sync_roster(crew_id)
                person_id = senders.person_id_for(record.sender_jid, record.sender_lid)
        if person_id is None:
            status, outcome = "ignored", {"reason": "unknown_sender"}
        else:
            ctx = HandlerContext(
                message=record,
                person_id=person_id,
                reply=lambda body: replier.reply(
                    chat_id=record.chat_id,
                    body=body,
                    reply_to=record.gowa_message_id,
                    inbound_id=record.id,
                ),
            )
            handled = route(ctx, handlers)
            status = "done"
            outcome = (
                {"handler": handled.handler, **handled.detail}
                if handled
                else {"reason": "no_handler"}
            )
    except Exception as exc:
        logger.exception("inbound %s failed", inbound_id)
        error = f"{exc.__class__.__name__}: {exc}"[:MAX_ERROR_CHARS]
        store.finish(
            inbound_id,
            status="failed",
            outcome={},
            error=error,
            person_id=person_id,
            now=clock.now(),
        )
        return "failed"
    store.finish(
        inbound_id, status=status, outcome=outcome, error="", person_id=person_id, now=clock.now()
    )
    return status
