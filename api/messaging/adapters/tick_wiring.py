"""Composition of the ``tick`` job. Tests monkeypatch ``process_one``."""

import os
import socket
from datetime import timedelta

from django.conf import settings

from messaging.adapters import wiring
from messaging.adapters.gowa_factory import build_gowa_client
from messaging.adapters.ledger import DjangoOutboundLedger
from messaging.adapters.tick_store import DjangoJobLocks, DjangoOutboundQueue, DjangoTickInbound
from messaging.use_cases.dispatch_queued import dispatch_queued
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

    def dispatch():
        return dispatch_queued(
            queue=DjangoOutboundQueue(),
            ledger=DjangoOutboundLedger(),
            gateway=build_gowa_client(),
            now=clock.now(),
            min_age=timedelta(seconds=QUEUED_MIN_AGE_SECONDS),
            max_attempts=config.max_attempts,
            limit=config.batch_size,
        )

    return run_tick(
        locks=DjangoJobLocks(),
        inbound=DjangoTickInbound(),
        rosters=wiring.crews_gateway(),
        process=lambda inbound_id: process_one(inbound_id),
        dispatch=dispatch,
        clock=clock,
        config=config,
        owner=f"{socket.gethostname()}:{os.getpid()}",
    )
