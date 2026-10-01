"""Composition of the ``tick`` job. Tests monkeypatch ``process_one``."""

import os
import socket
from datetime import datetime, timedelta

from django.conf import settings
from django.db import transaction

from messaging import reminders
from messaging.adapters import wiring
from messaging.adapters.gowa_factory import build_gowa_client
from messaging.adapters.identity_gateway import IdentityGateway
from messaging.adapters.ledger import DjangoOutboundLedger
from messaging.adapters.tick_store import DjangoJobLocks, DjangoOutboundQueue, DjangoTickInbound
from messaging.models import OutboundMessage
from messaging.use_cases.dispatch_queued import dispatch_queued
from messaging.use_cases.queue_reminders import queue_reminders
from messaging.use_cases.run_tick import TickConfig, run_tick
from shared.clock import SystemClock

QUEUED_MIN_AGE_SECONDS = 60  # younger rows may still be in flight in the process that made them


class TickReminderLedger(DjangoOutboundLedger):
    """The ledger the reminders phase writes to.

    Rows created by the tick itself are not in flight anywhere else, so they are backdated past
    ``QUEUED_MIN_AGE_SECONDS``: the dispatch phase of the SAME pass can send them.
    """

    def __init__(self, now: datetime) -> None:
        self._created_at = now - timedelta(seconds=QUEUED_MIN_AGE_SECONDS + 1)

    def reserve(self, **kwargs):
        entry = super().reserve(**kwargs)
        if entry.created:
            OutboundMessage.objects.filter(pk=entry.id).update(created_at=self._created_at)
        return entry


def process_one(inbound_id: int) -> str:
    return wiring.run_process_inbound(inbound_id)


def run_default_tick() -> dict[str, int] | None:
    clock = SystemClock()
    config = TickConfig(
        stuck_minutes=settings.INBOUND_STUCK_MINUTES,
        roster_sync_hours=settings.ROSTER_SYNC_HOURS,
    )

    queue = DjangoOutboundQueue()

    def dispatch(deadline):
        return dispatch_queued(
            queue=queue,
            gateway=build_gowa_client(),
            clock=clock,
            min_age=timedelta(seconds=QUEUED_MIN_AGE_SECONDS),
            max_attempts=config.max_attempts,
            limit=config.batch_size,
            deadline=deadline,
            mentions_enabled=settings.GOWA_MENTIONS_ENABLED,
        )

    def queue_due_reminders(now, deadline):
        return queue_reminders(
            chats=wiring.crews_gateway(),
            people=IdentityGateway(),
            ledger=TickReminderLedger(now),
            atomic=transaction.atomic,
            now=now,
            clock=clock,
            deadline=deadline,
            mentions_enabled=settings.GOWA_MENTIONS_ENABLED,
        )

    return run_tick(
        locks=DjangoJobLocks(),
        inbound=DjangoTickInbound(),
        outbound=queue,
        rosters=wiring.crews_gateway(),
        process=lambda inbound_id: process_one(inbound_id),
        dispatch=dispatch,
        reminders=queue_due_reminders,
        jobs=reminders.registered_tick_jobs(),
        clock=clock,
        config=config,
        owner=f"{socket.gethostname()}:{os.getpid()}",
    )
