from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from identity.use_cases.display_names import display_names
from logistics import conf
from logistics.adapters.django_store import DjangoTaskStore
from logistics.copy import es_ar
from logistics.domain_nag import due_label
from logistics.use_cases.tasks import complete_number, list_tasks
from messaging.handlers.types import Handled
from proposals.use_cases.get_proposal_snapshot import get_proposal_snapshot
from trips.use_cases.default_trip_for_crew import default_trip_for_crew
from trips.use_cases.get_trip_snapshot import get_trip_snapshot


def tareas(ctx, args):
    trip_id = default_trip_for_crew(ctx.crew_id)
    trip = get_trip_snapshot(trip_id) if trip_id else None
    tasks = list_tasks(trip_id, DjangoTaskStore(), ["open", "blocked"])[:15] if trip else []
    if not tasks:
        text = es_ar.NO_TASKS
    else:
        names = display_names([t["owner_id"] for t in tasks if t["owner_id"]])
        today = datetime.now(ZoneInfo(trip.timezone)).date()
        lines = [es_ar.TASKS_HEADER.format(trip=trip.name)]
        for t in tasks:
            name = names.get(t["owner_id"], es_ar.SAFE_PERSON) if t["owner_id"] else es_ar.NO_OWNER
            if name.startswith("+"):
                name = es_ar.SAFE_PERSON
            lines.append(
                es_ar.TASK_LINE.format(
                    number=t["number"],
                    title=t["title"],
                    owner=name,
                    due=due_label(t["due_on"], today),
                )
            )
        lines.append(f"{conf.public_origin()}/crews/{ctx.crew_id}/trips/{trip_id}/logistics")
        text = "\n".join(lines)
    return Handled("commands", {"command": "tareas", "reply": ctx.reply(text)})


def listo(ctx, args):
    if not args.strip().isdigit() or len(args.strip()) > 9:
        text = es_ar.LISTO_USAGE
    else:
        number = int(args.strip())
        trip_id = default_trip_for_crew(ctx.crew_id)
        task, already = (
            complete_number(
                trip_id, ctx.crew_id, ctx.person_id, number, DjangoTaskStore(), datetime.now(UTC)
            )
            if trip_id
            else (None, False)
        )
        if task is None:
            text = es_ar.TASK_NOT_FOUND.format(number=number)
        elif already:
            text = es_ar.TASK_ALREADY_DONE.format(number=number)
        else:
            text = es_ar.TASK_DONE.format(number=number, title=task["title"])
            proposal = get_proposal_snapshot(task["proposal_id"]) if task["proposal_id"] else None
            if proposal and proposal.status == "chosen":
                text += "\n" + es_ar.SUGGEST_MARK_BOOKED
    return Handled("commands", {"command": "listo", "reply": ctx.reply(text)})
