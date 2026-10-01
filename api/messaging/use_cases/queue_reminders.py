"""Run the registered reminder rules for every active trip and queue what they produce."""

import logging
from dataclasses import dataclass
from datetime import datetime

from messaging import reminders
from messaging.ports import OutboundLedger, ReminderTrips

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RemindersResult:
    queued: int = 0
    errors: int = 0


def queue_reminders(
    *, trips: ReminderTrips, ledger: OutboundLedger, now: datetime
) -> RemindersResult:
    """Queue the drafts of every rule; drafts produced in the trip's quiet hours are dropped (a
    later tick produces them again) and duplicates are ignored through ``dedupe_key``."""
    queued = errors = 0
    rules = reminders.registered_rules()
    for trip in trips.active_trips():
        ctx = reminders.ReminderContext(
            now=now,
            trip_id=trip.trip_id,
            crew_id=trip.crew_id,
            chat_id=trip.chat_id,
            trip_timezone=trip.timezone,
            trip_start_on=trip.start_on,
            trip_end_on=trip.end_on,
        )
        quiet = reminders.in_quiet_hours(now, trip.timezone, ctx.quiet_hours)
        for key, rule in rules:
            try:
                drafts = list(rule(ctx))
                for draft in [] if quiet else drafts:
                    entry = ledger.reserve(
                        to_jid=draft.to_jid,
                        kind=draft.kind,
                        body=draft.body,
                        dedupe_key=draft.dedupe_key,
                        reply_to=None,
                        subject_type=draft.subject_type,
                        subject_id=draft.subject_id,
                    )
                    queued += entry.created
            except Exception:
                logger.exception("reminder rule %s failed for trip %s", key, trip.trip_id)
                errors += 1
    return RemindersResult(queued=queued, errors=errors)
