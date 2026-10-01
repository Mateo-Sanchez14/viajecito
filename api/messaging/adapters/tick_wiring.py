"""Composition of the ``tick`` job. Tests monkeypatch ``process_one``."""

import os
import socket
from datetime import timedelta

from django.conf import settings

from messaging.adapters import wiring
from messaging.adapters.gowa_factory import build_gowa_client
from messaging.adapters.ledger import DjangoOutboundLedger
from messaging.adapters.tick_store import DjangoJobLocks, DjangoOutboundQueue, DjangoTickInbound
from messaging.adapters.trips_gateway import TripsGateway
from messaging.use_cases.dispatch_queued import dispatch_queued
from messaging.use_cases.queue_reminders import queue_reminders
from messaging.use_cases.run_tick import TickConfig, run_tick
from shared.clock import SystemClock

QUEUED_MIN_AGE_SECONDS = 60  # younger rows may still be in flight in the process that made them


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
        )

    def reminders(now):
        return queue_reminders(trips=TripsGateway(), ledger=DjangoOutboundLedger(), now=now)

    return run_tick(
        locks=DjangoJobLocks(),
        inbound=DjangoTickInbound(),
        outbound=queue,
        rosters=wiring.crews_gateway(),
        process=lambda inbound_id: process_one(inbound_id),
        dispatch=dispatch,
        reminders=reminders,
        clock=clock,
        config=config,
        owner=f"{socket.gethostname()}:{os.getpid()}",
    )
