"""What a reply to a proposal card means (pure): votes, status words and comments."""

import re
from dataclasses import dataclass

from proposals.domain.classifier import fold
from proposals.domain.rules import COMMENT_MAX, clean_block

_EMOJI_NOISE = re.compile("[️‍\U0001f3fb-\U0001f3ff]")  # variation selector, ZWJ, skin tones

_VOTES = {
    **dict.fromkeys(("+1", "👍", "si", "me gusta", "va"), 1),
    **dict.fromkeys(("-1", "👎", "no"), -1),
    **dict.fromkeys(("0", "meh", "me da igual"), 0),
}
_TRANSITIONS = {
    **dict.fromkeys(("elegida", "elegido", "la elegimos"), "chosen"),
    **dict.fromkeys(("reservada", "reservado", "booked"), "booked"),
    **dict.fromkeys(("descartar", "descartada", "descartado"), "discarded"),
}
_COMMENT_PREFIXES = ("comentario:", "nota:")


@dataclass(frozen=True)
class Verb:
    kind: str  # "vote" | "transition" | "reopen" | "comment"
    value: int | str | None  # vote value, target status, or the comment text


def normalize(text: str) -> str:
    return fold(_EMOJI_NOISE.sub("", text)).strip()


def parse_verb(body: str) -> Verb | None:
    """The action a quoted reply asks for, or ``None`` for ordinary chatter.

    Words must match exactly (after trimming, accent and case folding; emoji skin tones and
    variation selectors are ignored); ``comentario:`` / ``nota:`` carry free text.
    """
    folded = normalize(body)
    if folded in _VOTES:
        return Verb("vote", _VOTES[folded])
    if folded in _TRANSITIONS:
        return Verb("transition", _TRANSITIONS[folded])
    if folded == "reabrir":
        return Verb("reopen", None)
    if folded.startswith(_COMMENT_PREFIXES):
        text = clean_block(body.strip().partition(":")[2], COMMENT_MAX)
        return Verb("comment", text) if text else None
    return None


REOPEN_TARGETS = {
    "discarded": "proposed",
    "chosen": "discussing",
    "booked": "chosen",
    "discussing": "proposed",
}


def reopen_target(current: str) -> str:
    """Where ``reabrir`` sends a proposal (the same status when there is nothing to reopen)."""
    return REOPEN_TARGETS.get(current, current)
