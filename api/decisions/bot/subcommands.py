"""``/viaje fechas`` (alias ``fecha``): how the dates vote is going on the crew's default trip."""

import re
from zoneinfo import ZoneInfo

from decisions import conf
from decisions.adapters.django_store import DjangoDecisionStore
from decisions.adapters.trips_gateway import CoreTripGateway
from decisions.bot.urls import dates_page_url
from decisions.copy import es_ar
from decisions.use_cases.dates_status import DatesState, DatesStatus, dates_status
from messaging.handlers import commands
from messaging.handlers.types import Handled, HandlerContext
from trips.use_cases.default_trip_for_crew import default_trip_for_crew

_PHONE = re.compile(r"\+?\d[\d\s-]*")


def speakable_name(display_name: str) -> str:
    """The display name, or neutral copy when core fell back to the member's phone number."""
    return es_ar.SOMEONE if _PHONE.fullmatch(display_name.strip()) else display_name


def render(status: DatesStatus, crew_id: str) -> str:
    trip = status.trip
    if status.state is DatesState.NO_TRIP or trip is None:
        return es_ar.NO_TRIP.format(url=conf.public_origin())
    url = dates_page_url(crew_id, trip.id)
    if status.state is DatesState.FIXED:
        return es_ar.DATES_FIXED.format(
            start=es_ar.format_day(trip.start_on), end=es_ar.format_day(trip.end_on)
        )
    if status.state is DatesState.NO_DECISION:
        return es_ar.NO_DECISION.format(url=url)
    board = status.board
    lines = [es_ar.SUMMARY_HEADER.format(trip=trip.name)]
    if board.has_data:
        for rank, window in enumerate(board.windows, start=1):
            lines.append(
                es_ar.WINDOW_LINE.format(
                    rank=rank,
                    start=es_ar.format_day(window.start),
                    end=es_ar.format_day(window.end),
                    full=len(window.full_people),
                    blocked=len(window.blocked_people),
                )
            )
    else:
        lines.append(es_ar.NO_VOTES_YET)
    if board.non_responders:
        names = ", ".join(speakable_name(p.display_name) for p in board.non_responders)
        lines.append(es_ar.MISSING_LINE.format(names=names))
    deadline = board.decision.deadline
    if deadline is not None:
        local = deadline.astimezone(ZoneInfo(trip.timezone))
        lines.append(es_ar.DEADLINE_LINE.format(deadline=es_ar.format_moment(local)))
    lines.append(es_ar.LINK_LINE.format(url=url))
    return "\n".join(lines)


def fechas(ctx: HandlerContext, args: str) -> Handled | None:
    status = dates_status(
        default_trip_for_crew(ctx.crew_id), DjangoDecisionStore(), CoreTripGateway()
    )
    reply = ctx.reply(render(status, ctx.crew_id))
    return Handled("commands", {"command": "fechas", "reply": reply, "state": status.state.value})


def register() -> None:
    commands.register_subcommand("fechas", fechas, aliases=("fecha",), help_line=es_ar.HELP_FECHAS)
