"""Transaction-aware publishing; kept apart so ``shared.events`` stays free of Django."""

from typing import Any

from django.db import transaction

from shared import events


def publish_after_commit(event_name: str, **payload: Any) -> None:
    """Publish once the surrounding transaction commits (dropped on rollback).

    Outside an atomic block ``on_commit`` runs the callback immediately.
    """
    transaction.on_commit(lambda: events.publish(event_name, **payload))
