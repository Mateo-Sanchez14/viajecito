"""Transaction-aware publishing; kept apart so ``shared.events`` stays free of Django.

``events.publish`` is synchronous and its subscriber failures roll the publisher's transaction
back. ``publish_after_commit`` is the opposite trade: it runs only once the transaction has
committed (never on rollback) and isolates every subscriber, logging failures instead of raising.
Use it for non-critical side effects (notifications, caches), never for effects that must be part
of the same atomic change.
"""

import logging
from typing import Any

from django.db import transaction

from shared import events

logger = logging.getLogger(__name__)


def _publish_isolated(event_name: str, payload: dict[str, Any]) -> None:
    for callback in events.subscribers(event_name):
        try:
            callback(**payload)
        except Exception:
            logger.exception("subscriber %r of event %s failed", callback, event_name)


def publish_after_commit(event_name: str, **payload: Any) -> None:
    """Publish once the surrounding transaction commits (dropped on rollback).

    Outside an atomic block ``on_commit`` runs the callback immediately.
    """
    transaction.on_commit(lambda: _publish_isolated(event_name, payload))
