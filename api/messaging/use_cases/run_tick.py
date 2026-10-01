"""One pass of the periodic ``tick`` job.

Unsticks and reprocesses inbound rows, queues reminders, redelivers outbound rows and refreshes
rosters.
"""

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from messaging.ports import JobLocks, OutboundQueue, RosterSyncSource, TickInbound
from messaging.reminders import TickJob
from messaging.use_cases.dispatch_queued import DispatchResult
from messaging.use_cases.queue_reminders import RemindersResult
from shared.clock import Clock

logger = logging.getLogger(__name__)

LOCK_NAME = "tick"


@dataclass(frozen=True)
class TickConfig:
    stuck_minutes: int
    roster_sync_hours: int
    max_attempts: int = 3
    lock_seconds: int = 120
    batch_size: int = 100
    deadline_margin_seconds: int = 15  # stop starting work when the lock has less left


def run_tick(
    *,
    locks: JobLocks,
    inbound: TickInbound,
    outbound: OutboundQueue,
    rosters: RosterSyncSource,
    process: Callable[[int], str],
    dispatch: Callable[[datetime], DispatchResult],
    reminders: Callable[[datetime, datetime], RemindersResult] | None = None,
    jobs: Sequence[tuple[str, TickJob]] = (),
    clock: Clock,
    config: TickConfig,
    owner: str,
) -> dict[str, int] | None:
    """Return the summary, or ``None`` when another tick holds the lock (nothing was done)."""
    now = clock.now()
    deadline = now + timedelta(seconds=config.lock_seconds - config.deadline_margin_seconds)
    if not locks.acquire(LOCK_NAME, now + timedelta(seconds=config.lock_seconds), owner, now):
        return None
    errors = 0
    try:
        requeued, swept_failed = inbound.sweep_stuck(
            now - timedelta(minutes=config.stuck_minutes), config.max_attempts, now
        )
        outbound.sweep_stuck(
            now - timedelta(minutes=config.stuck_minutes), config.max_attempts, now
        )
        processed = 0
        for inbound_id in inbound.received_ids(config.batch_size):
            if clock.now() >= deadline:
                break
            try:
                if process(inbound_id) != "skipped":
                    processed += 1
            except Exception:  # one bad row must not stop the pass
                logger.exception("tick: processing inbound %s crashed", inbound_id)
                errors += 1
        reminders_queued = reminders_quiet = reminders_skipped = 0
        if reminders is not None and clock.now() < deadline:
            try:
                outcome = reminders(now, deadline)
                reminders_queued, reminders_quiet = outcome.queued, outcome.quiet
                reminders_skipped = outcome.deadline_skipped
                errors += outcome.errors
            except Exception:  # e.g. database trouble: the next tick tries again
                logger.exception("tick: reminders phase crashed")
                errors += 1
        dispatched = dispatch(deadline)
        synced = 0
        for crew_id in rosters.crews_needing_sync(now - timedelta(hours=config.roster_sync_hours)):
            if clock.now() >= deadline:
                break
            try:
                rosters.sync_roster(crew_id)
                synced += 1
            except Exception:  # gateway down: stays stale, retried on the next tick
                logger.exception("tick: roster sync of crew %s failed", crew_id)
                errors += 1
        jobs_run = 0
        job_counters: dict[str, int] = {}
        for key, job in jobs:
            if clock.now() >= deadline:
                break
            try:
                result = job(now)
            except Exception:  # one bad job must not stop the others
                logger.exception("tick: job %s failed", key)
                errors += 1
                continue
            jobs_run += 1
            job_counters.update({f"{key}.{name}": value for name, value in (result or {}).items()})
        return {
            "requeued": requeued,
            "swept_failed": swept_failed,
            "processed": processed,
            "dispatched": dispatched.sent,
            "dispatch_failed": dispatched.failed,
            "rosters_synced": synced,
            "reminders_queued": reminders_queued,
            "reminders_quiet": reminders_quiet,
            "reminders_deadline_skipped": reminders_skipped,
            "jobs_run": jobs_run,
            **job_counters,
            "errors": errors,
        }
    finally:
        locks.release(LOCK_NAME, owner, clock.now())
