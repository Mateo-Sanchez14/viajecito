"""The registered /viaje hoy subcommand uses pure snapshot bridges."""

from crews.use_cases.active_member_ids import active_member_ids
from itinerary import conf
from itinerary.copy import es_ar as copy
from itinerary.domain.render import render_today
from itinerary.use_cases.get_today import get_today
from messaging.handlers.commands import register_subcommand
from messaging.handlers.types import Handled
from shared.clock import SystemClock
from trips.use_cases.default_trip_for_crew import default_trip_for_crew
from trips.use_cases.get_trip_snapshot import get_trip_snapshot

clock = SystemClock()


def today_path(trip):
    return f"/crews/{trip.crew_id}/trips/{trip.id}/today"


def hoy(ctx, args):
    if ctx.person_id not in active_member_ids(ctx.crew_id):
        return Handled("commands", {"command": "hoy", "reason": "not_member"})
    trip_id = default_trip_for_crew(ctx.crew_id)
    trip = get_trip_snapshot(trip_id) if trip_id else None
    if trip is None or trip.crew_id != ctx.crew_id:
        body = copy.NO_TRIP.format(url=conf.public_origin())
        mode = "undated"
    else:
        snapshot = get_today(trip, clock.now())
        body = render_today(trip, snapshot, conf.public_origin() + today_path(trip))
        mode = snapshot.mode
    return Handled("commands", {"command": "hoy", "reply": ctx.reply(body), "mode": mode})


def register():
    register_subcommand("hoy", hoy, help_line=copy.HELP_HOY)
