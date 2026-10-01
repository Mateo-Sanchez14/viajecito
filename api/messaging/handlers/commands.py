"""``/viaje <sub>`` and ``/v <sub>`` bot commands (case, accent and whitespace tolerant)."""

import re
import unicodedata

from messaging.copy import es_ar
from messaging.handlers.types import Handled, HandlerContext

_COMMAND = re.compile(r"^/(?:viaje|v)(?:\s+(\S+).*)?$", re.DOTALL)


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold().strip()


def parse_command(text: str) -> str | None:
    """The folded subcommand (``""`` when absent) or ``None`` when ``text`` is not a command."""
    match = _COMMAND.match(_fold(text))
    if match is None:
        return None
    return match.group(1) or ""


_REPLIES = {"ping": es_ar.PONG, "ayuda": es_ar.HELP, "": es_ar.HELP}


def handle(ctx: HandlerContext) -> Handled | None:
    sub = parse_command(ctx.message.body)
    if sub is None:
        return None
    body = _REPLIES.get(sub)
    command = (sub or "ayuda") if body is not None else "unknown"
    if not ctx.reply_allowed():  # flood protection: say nothing, but record that we heard it
        return Handled("commands", {"command": command, "reply": "throttled", "throttled": True})
    status = ctx.reply(body if body is not None else es_ar.UNKNOWN_COMMAND)
    return Handled("commands", {"command": command, "reply": status})
