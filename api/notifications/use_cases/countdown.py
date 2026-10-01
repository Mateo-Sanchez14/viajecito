from collections.abc import Iterable
from datetime import date, datetime
from typing import Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from messaging.reminders import ReminderDraft
from notifications.copy.es_ar import COUNTDOWN_BODY, COUNTDOWN_TITLE


class CountdownTrip(Protocol):
    """The slice of ``trips.use_cases`` trip data the rule reads."""

    id: str
    crew_id: str
    name: str
    status: str
    start_on: date | None
    timezone: str


COUNTDOWN_DAYS = (30, 7, 1)
COUNTDOWN_STATUSES = ("planning", "booked")


def countdown_drafts(now: datetime, trips: Iterable[CountdownTrip]) -> list[ReminderDraft]:
    """One draft per trip that starts in exactly 30, 7 or 1 days (counted in the trip's timezone).

    Pure read; the dedupe key ``notifications:countdown:<trip_id>:T-<n>`` makes it idempotent.
    """
    drafts: list[ReminderDraft] = []
    for trip in trips:
        if trip.status not in COUNTDOWN_STATUSES or trip.start_on is None:
            continue
        try:
            today = now.astimezone(ZoneInfo(trip.timezone)).date()
        except (ZoneInfoNotFoundError, ValueError):
            continue
        days = (trip.start_on - today).days
        if days not in COUNTDOWN_DAYS:
            continue
        drafts.append(
            ReminderDraft(
                crew_id=trip.crew_id,
                trip_id=trip.id,
                body=COUNTDOWN_BODY[days].format(trip=trip.name),
                dedupe_key=f"notifications:countdown:{trip.id}:T-{days}",
                timezone=trip.timezone,
                subject_type="trip",
                subject_id=trip.id,
                title=COUNTDOWN_TITLE,
                url_path=f"/crews/{trip.crew_id}/trips/{trip.id}",
            )
        )
    return drafts
