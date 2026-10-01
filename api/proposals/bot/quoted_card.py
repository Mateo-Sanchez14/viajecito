"""Replies to a proposal card (+1, "elegida", "descartar", "comentario: ..."): handler order 20."""

import logging

from messaging.handlers.types import Handled, HandlerContext
from proposals.adapters import wiring
from proposals.copy import es_ar
from proposals.domain.card import clean_title
from proposals.domain.status import InvalidTransitionError
from proposals.domain.verbs import Verb, parse_verb, reopen_target
from proposals.use_cases.add_comment import add_comment
from proposals.use_cases.cast_vote import ProposalClosedError, cast_vote
from proposals.use_cases.transition_proposal import transition_proposal

logger = logging.getLogger(__name__)
HANDLER = "quoted_card"


def handle(ctx: HandlerContext) -> Handled | None:
    """Claims a message only when it quotes OUR proposal card and says a known verb."""
    subject = ctx.quoted_subject
    if subject is None or subject[0] != "proposal":
        return None
    verb = parse_verb(ctx.message.body)
    if verb is None:
        return None
    store = wiring.store()
    try:
        proposal = store.get(subject[1])
    except (ValueError, TypeError):  # not a uuid: not ours
        return None
    if proposal is None or proposal.crew_id != ctx.crew_id:
        return None
    action, text = _act(ctx, verb, proposal)
    detail = {"action": action, "proposal_id": proposal.id}
    if not ctx.reply_allowed():  # the action is recorded; flood protection keeps the chat quiet
        return Handled(HANDLER, {**detail, "reply": "throttled"})
    return Handled(HANDLER, {**detail, "reply": ctx.reply(text)})


def _act(ctx: HandlerContext, verb: Verb, proposal) -> tuple[str, str]:
    """Do what the verb asks; returns ``(action, reply text)``."""
    store = wiring.store()
    title = clean_title(proposal.title)
    person = ctx.person_id
    if verb.kind == "vote":
        try:
            outcome = cast_vote(
                store, proposal.id, person, int(verb.value), source_message_id=ctx.message.id
            )
        except ProposalClosedError:
            return "vote_refused", es_ar.PROPOSAL_CLOSED.format(title=title)
        return "vote", es_ar.VOTE_RECORDED.format(
            vote_label=es_ar.VOTE_LABELS[int(verb.value)],
            title=title,
            up=outcome.tally.up,
            down=outcome.tally.down,
        )
    if verb.kind == "comment":
        add_comment(store, proposal.id, person, str(verb.value), source_message_id=ctx.message.id)
        return "comment", es_ar.COMMENT_ADDED.format(title=title)
    target = reopen_target(proposal.status) if verb.kind == "reopen" else str(verb.value)
    try:
        transition_proposal(store, proposal.id, target, person)
    except InvalidTransitionError:
        return "transition_refused", es_ar.INVALID_TRANSITION.format(
            title=title,
            from_label=es_ar.STATUS_LABELS[proposal.status],
            to_label=es_ar.STATUS_LABELS[target],
        )
    return "transition", es_ar.STATUS_CHANGED.format(
        title=title, status_label=es_ar.STATUS_LABELS[target]
    )
