"""Sending pushes: the reminder channel and the settings page's test notification."""

import json
import logging
import re
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from messaging.reminders import ReminderDraft
from notifications.copy.es_ar import TEST_PUSH
from notifications.domain.payload import PushContent, build_payload, category_of
from notifications.domain.preferences import is_enabled
from notifications.domain.subscriptions import (
    InvalidSubscriptionError,
    RateLimitedError,
    endpoint_host,
)
from notifications.ports import (
    DeliveryLedger,
    PreferenceStore,
    PushSender,
    SubscriptionData,
    SubscriptionStore,
)
from shared.clock import Clock

logger = logging.getLogger(__name__)

MAX_SENDS_PER_DRAFT = 20
MAX_FAILURES = 5
RECIPIENT_RSVPS = ("in", "maybe")
TEST_URL = "/me/notifications"

_MENTION = re.compile(r"\{@([^{}]*)\}")


class PushUnavailableError(Exception):
    """No VAPID keys are configured."""


@dataclass(frozen=True)
class PushServices:
    subscriptions: SubscriptionStore
    preferences: PreferenceStore
    ledger: DeliveryLedger
    sender: PushSender
    clock: Clock
    allowed_hosts: Iterable[str]
    participants: Callable[[str], list[tuple[str, str]]]  # trip_id -> [(person_id, rsvp)]
    names: Callable[[list[str]], dict[str, str]]  # person ids -> display names
    budget_seconds: float = 20.0
    monotonic: Callable[[], float] = time.monotonic


def recipient_ids(draft: ReminderDraft, services: PushServices) -> list[str]:
    """Mentioned people if the draft names any, else the trip's ``in``/``maybe`` participants."""
    if draft.mention_person_ids:
        candidates = list(draft.mention_person_ids)
    elif draft.trip_id:
        candidates = [
            pid for pid, rsvp in services.participants(draft.trip_id) if rsvp in RECIPIENT_RSVPS
        ]
    else:
        candidates = []
    valid: list[str] = []
    for person_id in dict.fromkeys(candidates):
        try:
            valid.append(str(UUID(str(person_id))))
        except ValueError:
            logger.warning("push recipient %r is not a person id", person_id)
    return valid


def _send_all(
    subscriptions: list[SubscriptionData], payload: str, services: PushServices, budget: "_Budget"
) -> int:
    """Send to each subscription; prunes dead ones. Returns how many deliveries succeeded."""
    ok = 0
    for subscription in subscriptions:
        if not budget.allow():
            break
        try:
            endpoint_host(subscription.endpoint, services.allowed_hosts)
        except InvalidSubscriptionError:
            services.subscriptions.delete(subscription.id)  # allowlist changed since registering
            continue
        try:
            result = services.sender.send(subscription, payload)
        except Exception:
            logger.exception("push sender crashed for subscription %s", subscription.id)
            continue
        now = services.clock.now()
        if result.outcome == "ok":
            services.subscriptions.mark_ok(subscription.id, now)
            ok += 1
        elif result.outcome == "gone":
            services.subscriptions.delete(subscription.id)
        else:
            failures = services.subscriptions.mark_failed(subscription.id, now)
            if failures >= MAX_FAILURES:
                services.subscriptions.delete(subscription.id)
    return ok


class _Budget:
    """At most ``MAX_SENDS_PER_DRAFT`` sends and ``seconds`` of wall clock per reminder."""

    def __init__(self, services: PushServices) -> None:
        self._sends = 0
        self._deadline = services.monotonic() + services.budget_seconds
        self._monotonic = services.monotonic

    def allow(self) -> bool:
        if self._sends >= MAX_SENDS_PER_DRAFT or self._monotonic() >= self._deadline:
            return False
        self._sends += 1
        return True


def deliver_push(draft: ReminderDraft, services: PushServices) -> None:
    """Mirror one newly queued group reminder to the people it concerns. Idempotent per
    ``(dedupe_key, person)``; failures of one person never stop the others."""
    people = recipient_ids(draft, services)
    if not people:
        return
    token_ids = list(dict.fromkeys(_MENTION.findall(draft.body)))
    names = services.names(token_ids) if token_ids else {}
    payload = json.dumps(
        build_payload(draft, names, int(services.clock.now().timestamp())), ensure_ascii=False
    )
    category = category_of(draft.dedupe_key)
    preferences = services.preferences.stored_for_people(people)
    budget = _Budget(services)
    for person_id in people:
        try:
            if not is_enabled(preferences.get(person_id, {}), category):
                if services.ledger.reserve(draft.dedupe_key, person_id):
                    services.ledger.finish(draft.dedupe_key, person_id, "skipped", 0)
                continue
            subscriptions = services.subscriptions.list_for_person(person_id)
            if not subscriptions:
                continue
            if not services.ledger.reserve(draft.dedupe_key, person_id):
                continue
            ok = _send_all(subscriptions, payload, services, budget)
            services.ledger.finish(draft.dedupe_key, person_id, "sent" if ok else "failed", ok)
        except Exception:
            logger.exception("push delivery failed for person %s", person_id)


def send_test_push(person_id: str, services: PushServices) -> int:
    """The settings page's "send me one": to every subscription of the person, once a minute.

    Returns how many deliveries succeeded. Raises ``RateLimitedError`` inside the same minute.
    """
    now = services.clock.now()
    key = f"test:{int(now.timestamp()) // 60}"
    if not services.ledger.reserve(key, person_id):
        raise RateLimitedError(60)
    content = PushContent(title="", body=TEST_PUSH, dedupe_key=key, url_path=TEST_URL)
    payload = json.dumps(build_payload(content, {}, int(now.timestamp())), ensure_ascii=False)
    ok = _send_all(
        services.subscriptions.list_for_person(person_id), payload, services, _Budget(services)
    )
    services.ledger.finish(key, person_id, "sent" if ok else "failed", ok)
    return ok


def prune_deliveries(
    now: datetime, ledger: DeliveryLedger, *, days: int = 30, limit: int = 1000
) -> dict[str, int]:
    return {"deleted": ledger.delete_older_than(now - timedelta(days=days), limit)}
