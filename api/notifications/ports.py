"""Ports of the notifications app: storage, the push sender and their composition-root hooks."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

from notifications.domain.subscriptions import ValidSubscription

DeliveryStatus = Literal["sent", "failed", "skipped"]


@dataclass(frozen=True)
class SubscriptionData:
    id: str
    person_id: str
    endpoint: str
    p256dh: str
    auth: str
    failure_count: int
    created_at: datetime


@dataclass(frozen=True)
class SendResult:
    """``ok`` delivered; ``gone`` the push service says the subscription is dead (404/410);
    ``error`` any other HTTP failure (counted against the subscription); ``config_error`` the
    request never got an HTTP response (bad key, bad subject, network): our side, so it never
    counts against a subscription."""

    outcome: Literal["ok", "gone", "error", "config_error"]


class SubscriptionStore(Protocol):
    def list_for_person(self, person_id: str) -> list[SubscriptionData]: ...

    def get_by_endpoint(self, endpoint: str) -> SubscriptionData | None: ...

    def touched_since(self, person_id: str, since: datetime, excluding_endpoint: str) -> int:
        """Subscriptions of the person registered or refreshed since ``since``."""
        ...

    def upsert(
        self, person_id: str, subscription: ValidSubscription
    ) -> tuple[SubscriptionData, bool]:
        """Create, or refresh (and re-assign to ``person_id``) the row of that endpoint."""
        ...

    def delete_endpoint(self, person_id: str, endpoint: str) -> None:
        """Only that person's row; anything else is left alone."""
        ...

    def delete(self, subscription_id: str) -> None: ...

    def mark_ok(self, subscription_id: str, now: datetime) -> None: ...

    def mark_failed(self, subscription_id: str, now: datetime) -> int:
        """Bump ``failure_count`` and ``last_error_at``; returns the new count."""
        ...


class PreferenceStore(Protocol):
    def stored(self, person_id: str) -> dict[str, bool]: ...

    def save(self, person_id: str, changes: dict[str, bool]) -> None: ...

    def stored_for_people(self, person_ids: list[str]) -> dict[str, dict[str, bool]]: ...


class DeliveryLedger(Protocol):
    def reserve(self, dedupe_key: str, person_id: str) -> bool:
        """Insert ``(dedupe_key, person)``; ``False`` when it already exists."""
        ...

    def finish(
        self, dedupe_key: str, person_id: str, status: DeliveryStatus, subscriptions_ok: int
    ) -> None: ...

    def delete_older_than(self, cutoff: datetime, limit: int) -> int: ...


class PushSender(Protocol):
    def send(self, subscription: SubscriptionData, payload: str) -> SendResult:
        """Deliver one encrypted payload. Never raises for push-service failures."""
        ...


_sender_factory: Callable[[], PushSender] | None = None


def set_default_sender(factory: Callable[[], PushSender]) -> None:
    """Composition root hook: ``NotificationsConfig.ready()`` installs the pywebpush sender."""
    global _sender_factory
    _sender_factory = factory


def default_sender() -> PushSender:
    if _sender_factory is None:
        raise RuntimeError("no push sender configured (is the notifications app installed?)")
    return _sender_factory()


@contextmanager
def use_sender(sender: PushSender) -> Iterator[None]:
    """Tests only: use ``sender`` for the duration of the block, then restore the previous one."""
    global _sender_factory
    previous = _sender_factory
    _sender_factory = lambda: sender  # noqa: E731
    try:
        yield
    finally:
        _sender_factory = previous
