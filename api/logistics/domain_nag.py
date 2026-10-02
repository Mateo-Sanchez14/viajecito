from datetime import timedelta
from zoneinfo import ZoneInfo

from logistics.copy import es_ar

BACKOFF = (1, 1, 2, 4, 7)


def due_label(due_on, today):
    if due_on is None:
        return es_ar.NO_DUE
    days = (today - due_on).days
    if days == 0:
        return es_ar.DUE_TODAY
    if days == 1:
        return es_ar.OVERDUE_ONE
    if days > 0:
        return es_ar.OVERDUE.format(days=days)
    return es_ar.DUE_ON.format(day=due_on.strftime("%d/%m"))


def due_for_nag(task, now, tz, lead):
    today = now.astimezone(ZoneInfo(tz)).date()
    if (
        task["status"] != "open"
        or task["due_on"] is None
        or task["due_on"] > today + timedelta(days=lead)
    ):
        return False
    last = task["last_nudged_at"]
    return (
        last is None
        or (today - last.astimezone(ZoneInfo(tz)).date()).days
        >= BACKOFF[min(task["nudge_count"], 4)]
    )
