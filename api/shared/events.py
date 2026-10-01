"""In-process domain events (pure; no Django).

Names follow ``"<app>.<entity>_<past_tense>"`` (``proposals.status_changed``). Payload keys are
ids and plain values, never model instances. Apps subscribe from ``AppConfig.ready()``.
"""

import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

_SUBSCRIBERS: dict[str, list[Callable[..., None]]] = {}


def subscribe(event_name: str, callback: Callable[..., None]) -> None:
    _SUBSCRIBERS.setdefault(event_name, []).append(callback)


def publish(event_name: str, **payload: Any) -> None:
    """Call every subscriber in registration order; a failing one is logged, never raised."""
    for callback in list(_SUBSCRIBERS.get(event_name, ())):
        try:
            callback(**payload)
        except Exception:
            logger.exception("subscriber %r of event %s failed", callback, event_name)


def clear() -> None:
    """Drop every subscription (tests)."""
    _SUBSCRIBERS.clear()
