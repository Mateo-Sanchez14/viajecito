"""``/viaje nieve``: conditions of the default trip's resorts, or a manual report."""

from decimal import Decimal

from identity.use_cases.display_names import display_names
from messaging.handlers.types import Handled, HandlerContext
from shared.clock import SystemClock
from ski import conf, domain
from ski.adapters.django_store import DjangoSkiStore
from ski.bot.formatting import conditions_block
from ski.copy import es_ar
from ski.use_cases.access import ski_enabled
from ski.use_cases.conditions import trip_conditions
from ski.use_cases.manual_report import RateLimitedError, add_manual_report
from trips.use_cases.default_trip_for_crew import default_trip_for_crew

HELP_LINE = es_ar.HELP_NIEVE


def _answer(ctx: HandlerContext, body: str, **detail) -> Handled:
    return Handled("ski", {"command": "nieve", "reply": ctx.reply(body), **detail})


def nieve(ctx: HandlerContext, args: str) -> Handled | None:
    store = DjangoSkiStore()
    trip_id = default_trip_for_crew(ctx.crew_id)
    trip = store.trip_info(trip_id) if trip_id else None
    if trip is None:
        return _answer(ctx, es_ar.NO_TRIP)
    if not ski_enabled(trip.type):
        return _answer(ctx, es_ar.NOT_SKI_TRIP)
    now = SystemClock().now()
    if not args.strip():
        return _conditions(ctx, trip, now, store)
    return _manual(ctx, trip, args, now, store)


def _conditions(ctx, trip, now, store) -> Handled:
    conditions = trip_conditions(trip.id, now, store)
    if not conditions:
        url = f"{conf.public_origin()}/crews/{trip.crew_id}/trips/{trip.id}/ski"
        return _answer(ctx, es_ar.NO_RESORTS.format(url=url))
    return _answer(ctx, conditions_block(conditions))


def _manual(ctx, trip, args, now, store) -> Handled:
    try:
        parsed = domain.parse_nieve_args(args)
    except domain.UsageError:
        return _answer(ctx, es_ar.NIEVE_USAGE)
    resorts = [link.resort for link in store.trip_resorts(trip.id)]
    resort = domain.match_resort(parsed.resort_query, resorts)
    if resort is None:
        names = ", ".join(r.name for r in resorts)
        return _answer(ctx, es_ar.RESORT_UNKNOWN.format(resorts=names))
    report = domain.ManualReportInput(
        base_cm=parsed.base_cm,
        new_24h_cm=None if parsed.new_24h_cm is None else Decimal(parsed.new_24h_cm),
    )
    try:
        add_manual_report(
            trip.id,
            resort.id,
            ctx.person_id,
            report,
            now,
            store,
            per_hour=conf.manual_reports_per_hour(),
        )
    except RateLimitedError:
        return _answer(ctx, es_ar.RATE_LIMITED)
    name = ctx.message.sender_name or display_names([ctx.person_id]).get(ctx.person_id, "")
    return _answer(
        ctx, es_ar.MANUAL_SAVED.format(name=name, base=parsed.base_cm, resort=resort.name)
    )
