"""Read-only daily drafts; tick owns quiet-hour enforcement and deduplicated delivery."""

from datetime import timedelta

from itinerary.copy.es_ar import DIGEST_TITLE
from itinerary.domain.render import render_today
from itinerary.use_cases.get_today import get_today
from messaging.reminders import ReminderDraft, digest_sections
from trips.use_cases.list_active_trips import list_active_trips


def morning_digest(ctx, *, origin=""):
    for trip in list_active_trips():
        snapshot = get_today(trip, ctx.now)
        tomorrow = bool(trip.start_on and snapshot.local_date == trip.start_on - timedelta(days=1))
        if snapshot.mode != "during" and not (snapshot.mode == "before" and tomorrow):
            continue
        path = f"/crews/{trip.crew_id}/trips/{trip.id}/today"
        yield ReminderDraft(
            crew_id=trip.crew_id,
            trip_id=trip.id,
            body=render_today(
                trip,
                snapshot,
                origin + path,
                digest_sections(trip.id, snapshot.local_date),
                tomorrow=tomorrow,
            ),
            dedupe_key=f"itinerary:digest:{trip.id}:{snapshot.local_date.isoformat()}",
            timezone=trip.timezone,
            title=DIGEST_TITLE,
            url_path=path,
        )
