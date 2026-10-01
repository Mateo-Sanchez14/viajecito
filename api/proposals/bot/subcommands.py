"""``/viaje propuestas``: the most voted open proposals of the default trip."""

from messaging.handlers.types import Handled, HandlerContext
from proposals import conf
from proposals.adapters import wiring
from proposals.copy import es_ar
from proposals.domain.card import clean_title
from proposals.use_cases.list_proposals import top_open_proposals
from trips.use_cases.default_trip_for_crew import default_trip_for_crew

TOP = 5


def propuestas(ctx: HandlerContext, args: str) -> Handled | None:
    trip_id = default_trip_for_crew(ctx.crew_id)
    if trip_id is None:
        text = es_ar.NO_ACTIVE_TRIP.format(url=conf.public_origin())
    else:
        views = top_open_proposals(wiring.store(), trip_id, ctx.person_id, TOP)
        list_url = f"{conf.public_origin()}/crews/{ctx.crew_id}/trips/{trip_id}/proposals"
        if not views:
            text = f"{es_ar.PROPUESTAS_EMPTY}\n{es_ar.PROPUESTAS_URL.format(url=list_url)}"
        else:
            lines = [es_ar.PROPUESTAS_HEADER]
            lines += [
                es_ar.PROPUESTAS_LINE.format(
                    n=n,
                    title=clean_title(view.record.title),
                    status_label=es_ar.STATUS_LABELS[view.record.status],
                    up=view.tally.up,
                    down=view.tally.down,
                )
                for n, view in enumerate(views, start=1)
            ]
            lines.append(es_ar.PROPUESTAS_URL.format(url=list_url))
            text = "\n".join(lines)
    return Handled("commands", {"command": "propuestas", "reply": ctx.reply(text)})
