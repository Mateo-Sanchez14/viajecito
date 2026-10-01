"""The inbound handler chain: first handler that claims the message wins."""

from collections.abc import Sequence

from messaging.handlers import commands
from messaging.handlers.types import Handled, Handler, HandlerContext

# Later milestones append the quoted-card and link-capture handlers here.
DEFAULT_HANDLERS: list[Handler] = [commands.handle]


def route(ctx: HandlerContext, handlers: Sequence[Handler]) -> Handled | None:
    for handler in handlers:
        handled = handler(ctx)
        if handled is not None:
            return handled
    return None
