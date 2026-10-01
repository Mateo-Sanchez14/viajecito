from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from django.db.models import F

from logistics import conf
from logistics.adapters.django_store import DjangoTaskStore
from logistics.copy import es_ar
from logistics.domain_nag import due_for_nag, due_label
from logistics.models import Task
from messaging.reminders import ReminderDraft
from trips.use_cases.list_active_trips import list_active_trips


def task_nag(ctx):
    for trip in list_active_trips():
        tasks = [
            t
            for t in DjangoTaskStore().list(trip.id)
            if due_for_nag(t, ctx.now, trip.timezone, conf.nag_lead_days())
        ]
        if not tasks:
            continue
        today = ctx.now.astimezone(ZoneInfo(trip.timezone)).date()
        lines = [es_ar.NAG_HEADER.format(trip=trip.name)]
        unowned = []
        for task in tasks:
            due = due_label(task["due_on"], today)
            if task["owner_id"]:
                lines.append(
                    es_ar.NAG_LINE.format(
                        mention="{@" + task["owner_id"] + "}", title=task["title"], due=due
                    )
                )
            else:
                unowned.append(f"{task['title']} ({due})")
        if unowned:
            lines.append(es_ar.NAG_UNOWNED.format(titles=", ".join(unowned)))
        path = f"/crews/{trip.crew_id}/trips/{trip.id}/logistics"
        lines.append(conf.public_origin() + path)
        body = "\n".join(lines)
        if len(body) > 4000:
            # A partial list must not advance nudge state; overflow UX belongs to integration.
            raise ValueError("Task reminder exceeds the 4000-character contract")
        yield ReminderDraft(
            crew_id=trip.crew_id,
            trip_id=trip.id,
            body=body,
            dedupe_key=f"logistics:nag:{trip.id}:{today}",
            timezone=trip.timezone,
            subject_type="task_batch",
            subject_id=",".join(t["id"] for t in tasks),
            mention_person_ids=tuple(dict.fromkeys(t["owner_id"] for t in tasks if t["owner_id"])),
            url_path=path,
        )


def on_queued(draft, *, now=None):
    now = now or datetime.now(UTC)
    Task.objects.filter(
        pk__in=draft.subject_id.split(","), trip_id=draft.trip_id, status="open"
    ).update(nudge_count=F("nudge_count") + 1, last_nudged_at=now)


def digest_section(trip_id, local_date):
    tasks = DjangoTaskStore().list(trip_id, ["open", "blocked"])
    due = [t for t in tasks if t["due_on"] and t["due_on"] <= local_date]
    return (
        "\n".join(
            es_ar.TASK_LINE.format(
                number=t["number"],
                title=t["title"],
                owner=es_ar.NO_OWNER,
                due=due_label(t["due_on"], local_date),
            )
            for t in due[:5]
        )
        or None
    )
