"""Composition root: builds the Django-backed services and registers the app's contributions."""

import logging
import time

from identity.use_cases.display_names import display_names
from messaging import reminders
from notifications import conf, ports
from notifications.adapters.django_store import (
    DjangoDeliveryLedger,
    DjangoPreferenceStore,
    DjangoSubscriptionStore,
)
from notifications.adapters.webpush_sender import WebPushSender
from notifications.use_cases.countdown import countdown_drafts
from notifications.use_cases.push_delivery import PushServices, deliver_push, prune_deliveries
from shared.clock import SystemClock
from trips.use_cases.list_active_trips import list_active_trips
from trips.use_cases.trip_participants import trip_participants

logger = logging.getLogger(__name__)


def build_sender() -> WebPushSender:
    return WebPushSender(
        private_key=conf.vapid_private_key(),
        subject=conf.vapid_subject(),
        timeout=conf.push_timeout_seconds(),
    )


def _participants(trip_id: str) -> list[tuple[str, str]]:
    return [(p.person_id, p.rsvp) for p in trip_participants(trip_id)]


def push_services() -> PushServices:
    return PushServices(
        subscriptions=DjangoSubscriptionStore(),
        preferences=DjangoPreferenceStore(),
        ledger=DjangoDeliveryLedger(),
        sender=ports.default_sender(),
        clock=SystemClock(),
        allowed_hosts=conf.endpoint_hosts(),
        participants=_participants,
        names=display_names,
        budget_seconds=conf.push_budget_seconds(),
        monotonic=time.monotonic,
    )


def push_channel(draft: reminders.ReminderDraft) -> None:
    """Reminder channel ``push``: a mirror of the group message; contains its own failures."""
    if not conf.push_enabled():
        return
    try:
        deliver_push(draft, push_services())
    except Exception:
        logger.exception("push channel failed for %s", draft.dedupe_key)


def countdown_rule(ctx: reminders.ReminderContext):
    return countdown_drafts(ctx.now, list_active_trips())


def prune_job(now) -> dict[str, int]:
    return prune_deliveries(now, DjangoDeliveryLedger())


def install() -> None:
    """Idempotent: ``AppConfig.ready()`` may run more than once."""
    ports.set_default_sender(build_sender)
    reminders.register_channel("push", push_channel)
    reminders.register_reminder_rule("notifications.countdown", countdown_rule)
    reminders.register_tick_job("notifications.prune", prune_job)


__all__ = ["install", "push_services"]
