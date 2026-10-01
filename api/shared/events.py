"""In-process domain events (pure; no Django).

``publish`` is synchronous and transactional: it runs every subscriber in registration order in the
caller's thread, and a subscriber exception PROPAGATES to the publisher. A publisher that calls it
inside ``transaction.atomic()`` after its writes therefore rolls the whole change back when a
subscriber fails; use it for effects that are part of the same user action. For non-critical side
effects use ``shared.events_django.publish_after_commit`` instead (deferred and isolated).

Event names are ``<noun>.<past_participle>`` (``proposal.status_changed``); payload values are
``str``, ``int``, ``bool``, ``None``, ``date`` or aware ``datetime`` (ids as ``str(uuid)``, never
model instances). Subscribe from ``AppConfig.ready()`` with idempotent subscribers.
"""

from collections.abc import Callable, Iterator
from contextlib import contextmanager

Subscriber = Callable[..., None]

_SUBSCRIBERS: dict[str, list[Subscriber]] = {}


def subscribe(event_name: str, callback: Subscriber) -> None:
    """Register ``callback`` for ``event_name``. Registering the same callable twice is a no-op."""
    registered = _SUBSCRIBERS.setdefault(event_name, [])
    if callback not in registered:
        registered.append(callback)


def publish(event_name: str, **payload: object) -> None:
    """Call every subscriber synchronously, in registration order, with ``**payload``.

    No subscribers: no-op. A subscriber exception propagates to the publisher.
    """
    for callback in subscribers(event_name):
        callback(**payload)


def subscribers(event_name: str) -> tuple[Subscriber, ...]:
    """The current subscribers of ``event_name`` (introspection for tests)."""
    return tuple(_SUBSCRIBERS.get(event_name, ()))


@contextmanager
def isolated() -> Iterator[None]:
    """Tests only: swap in an empty registry for the block, then restore the previous one."""
    global _SUBSCRIBERS
    previous = _SUBSCRIBERS
    _SUBSCRIBERS = {}
    try:
        yield
    finally:
        _SUBSCRIBERS = previous


def clear() -> None:
    """Drop every subscription (tests)."""
    _SUBSCRIBERS.clear()
