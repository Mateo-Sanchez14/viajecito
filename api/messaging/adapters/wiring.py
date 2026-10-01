"""Composition root of the messaging app. Tests monkeypatch these factories."""

from django.conf import settings

from messaging.adapters.crews_gateway import CrewsGateway
from messaging.adapters.inbound_store import DjangoInboundStore
from messaging.adapters.scheduler import ExecutorProcessScheduler


def inbound_store() -> DjangoInboundStore:
    return DjangoInboundStore()


def crews_gateway() -> CrewsGateway:
    return CrewsGateway()


def run_process_inbound(inbound_id: int) -> None:
    raise NotImplementedError  # replaced when processing lands


def process_scheduler() -> ExecutorProcessScheduler:
    return ExecutorProcessScheduler(
        run_process_inbound, synchronous=settings.MESSAGING_PROCESS_SYNC
    )
