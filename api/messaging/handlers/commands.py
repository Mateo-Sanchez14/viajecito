"""``/viaje <sub>`` and ``/v <sub>`` bot commands (case, accent and whitespace tolerant).

This handler (order 10) claims every ``/viaje ...`` message. Other apps add subcommands with
``register_subcommand`` from ``AppConfig.ready()``; ``ping`` and ``ayuda`` are core ones. Throttling
stays here: while the chat is throttled the handler records it and never calls the subcommand.
"""

import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass

from messaging.copy import es_ar
from messaging.handlers.types import Handled, HandlerContext

SubcommandHandler = Callable[[HandlerContext, str], Handled | None]
"""``(ctx, args)``: ``args`` is the text after the subcommand, original casing, stripped."""

_COMMAND = re.compile(r"^\s*/(\S+)(?:\s+(\S+)(?:\s+(.*))?)?\s*$", re.DOTALL)
_COMMAND_WORDS = frozenset({"viaje", "v"})


@dataclass(frozen=True)
class Subcommand:
    name: str  # folded
    handler: SubcommandHandler
    help_line: str


_SUBCOMMANDS: dict[str, Subcommand] = {}
_ALIASES: dict[str, str] = {}  # folded alias -> folded name


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold().strip()


def register_subcommand(
    name: str,
    handler: SubcommandHandler,
    *,
    aliases: tuple[str, ...] = (),
    help_line: str = "",
) -> None:
    """Add ``/viaje <name>`` (and its aliases). Names are matched folded (accent/case).

    Registering the same handler under the same name again is a no-op; any other clash with an
    existing name or alias raises ``ValueError``.
    """
    key = _fold(name)
    existing = _SUBCOMMANDS.get(key)
    if existing is not None and existing.handler is not handler:
        raise ValueError(f"subcommand {key!r} is already registered")
    folded_aliases = [_fold(alias) for alias in aliases]
    for token in (key, *folded_aliases):
        owner = _ALIASES.get(token) or (token if token in _SUBCOMMANDS else None)
        if owner is not None and owner != key:
            raise ValueError(f"subcommand name {token!r} is already taken by {owner!r}")
    _SUBCOMMANDS[key] = Subcommand(key, handler, help_line)
    for alias in folded_aliases:
        _ALIASES[alias] = key


def help_text() -> str:
    """The intro plus every registered ``help_line``, sorted by subcommand name."""
    lines = [es_ar.HELP_INTRO]
    lines += [sub.help_line for _, sub in sorted(_SUBCOMMANDS.items()) if sub.help_line]
    return "\n".join(lines)


def _ping(ctx: HandlerContext, args: str) -> Handled | None:
    return _answer(ctx, "ping", es_ar.PONG)


def _ayuda(ctx: HandlerContext, args: str) -> Handled | None:
    return _answer(ctx, "ayuda", help_text())


def _answer(ctx: HandlerContext, command: str, body: str) -> Handled:
    return Handled("commands", {"command": command, "reply": ctx.reply(body)})


def register_core_subcommands() -> None:
    register_subcommand("ping", _ping, help_line=es_ar.PING_HELP)
    register_subcommand("ayuda", _ayuda, help_line=es_ar.AYUDA_HELP)


register_core_subcommands()


def parse(text: str) -> tuple[str, str] | None:
    """``(folded subcommand, original-casing args)`` or ``None`` when ``text`` is not a command.

    The subcommand is ``""`` for a bare ``/viaje``.
    """
    match = _COMMAND.match(text)
    if match is None or _fold(match.group(1)) not in _COMMAND_WORDS:
        return None
    return _fold(match.group(2) or ""), (match.group(3) or "").strip()


def parse_command(text: str) -> str | None:
    """The folded subcommand (``""`` when absent) or ``None`` when ``text`` is not a command."""
    parsed = parse(text)
    return None if parsed is None else parsed[0]


def handle(ctx: HandlerContext) -> Handled | None:
    parsed = parse(ctx.message.body)
    if parsed is None:
        return None
    sub, args = parsed
    name = _ALIASES.get(sub, sub or "ayuda")
    subcommand = _SUBCOMMANDS.get(name)
    command = name if subcommand is not None else "unknown"
    if not ctx.reply_allowed():  # flood protection: say nothing, but record that we heard it
        return Handled("commands", {"command": command, "reply": "throttled", "throttled": True})
    if subcommand is None:
        hint = f"{es_ar.UNKNOWN_COMMAND}\n{help_text()}"  # the hint leads the full help
        return Handled("commands", {"command": command, "reply": ctx.reply(hint)})
    return subcommand.handler(ctx, args)
