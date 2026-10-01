"""The inbound handler chain: first handler that claims the message wins.

Apps register their handlers from ``AppConfig.ready()`` with ``register_handler(order, handler)``;
the chain runs them by ascending order (commands 10, quoted card 20, link capture 30, fallback 100).
"""

from collections.abc import Sequence

from messaging.handlers.types import Handled, Handler, HandlerContext

_REGISTRY: list[tuple[int, Handler]] = []


def register_handler(order: int, handler: Handler) -> None:
    """Add ``handler`` to the chain. Registering the same pair again is a no-op."""
    entry = (order, handler)
    if entry not in _REGISTRY:
        _REGISTRY.append(entry)


def registered() -> list[tuple[int, Handler]]:
    return list(_REGISTRY)


def handler_chain() -> list[Handler]:
    """The registered handlers by ascending order (stable for equal orders)."""
    return [handler for _, handler in sorted(_REGISTRY, key=lambda entry: entry[0])]


def route(ctx: HandlerContext, handlers: Sequence[Handler]) -> Handled | None:
    for handler in handlers:
        handled = handler(ctx)
        if handled is not None:
            return handled
    return None
