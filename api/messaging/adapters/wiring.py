"""Composition root of the messaging app. Tests monkeypatch these factories."""

from datetime import timedelta

from django.conf import settings

from messaging import router
from messaging.adapters.crews_gateway import CrewsGateway
from messaging.adapters.identity_gateway import IdentityGateway
from messaging.adapters.inbound_store import DjangoInboundStore
from messaging.adapters.replier import GroupReplier
from messaging.adapters.scheduler import ExecutorProcessScheduler
from messaging.use_cases.process_inbound import process_inbound
from shared.clock import SystemClock


def inbound_store() -> DjangoInboundStore:
    return DjangoInboundStore()


def crews_gateway() -> CrewsGateway:
    return CrewsGateway()


def run_process_inbound(inbound_id: int) -> str:
    return process_inbound(
        inbound_id,
        store=inbound_store(),
        senders=IdentityGateway(),
        roster=crews_gateway(),
        replier=GroupReplier(),
        handlers=router.DEFAULT_HANDLERS,
        clock=SystemClock(),
        roster_min_interval=timedelta(seconds=settings.ROSTER_SYNC_MIN_INTERVAL_SECONDS),
    )


def process_scheduler() -> ExecutorProcessScheduler:
    return ExecutorProcessScheduler(
        run_process_inbound, synchronous=settings.MESSAGING_PROCESS_SYNC
    )
