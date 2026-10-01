"""Reminder rule ``decisions.missing_votes``: nudge whoever has not marked their days."""

from collections.abc import Iterable
from zoneinfo import ZoneInfo

from decisions import conf
from decisions.adapters.django_store import DjangoDecisionStore
from decisions.adapters.trips_gateway import CoreTripGateway
from decisions.bot.urls import dates_page_path, dates_page_url
from decisions.copy import es_ar
from decisions.use_cases.missing_votes import Nudge, NudgeKind, due_nudges
from messaging import reminders
from messaging.reminders import ReminderContext, ReminderDraft

RULE_KEY = "decisions.missing_votes"


def draft_for(nudge: Nudge) -> ReminderDraft:
    trip, decision = nudge.trip, nudge.decision
    mentions = " ".join(f"{{@{p.person_id}}}" for p in nudge.non_responders)
    url = dates_page_url(trip.crew_id, trip.id)
    if nudge.kind is NudgeKind.DEADLINE:
        local = decision.deadline.astimezone(ZoneInfo(trip.timezone))
        body = es_ar.MISSING_VOTES.format(
            mentions=mentions, when=f"el {es_ar.format_moment(local)}", url=url
        )
        key = f"decisions:missing:{decision.id}:{nudge.local_date.isoformat()}"
    else:
        body = es_ar.MISSING_VOTES_NO_DEADLINE.format(mentions=mentions, url=url)
        key = f"decisions:missing:{decision.id}:day3"
    return ReminderDraft(
        crew_id=trip.crew_id,
        trip_id=trip.id,
        body=body,
        dedupe_key=key,
        timezone=trip.timezone,
        subject_type="decision",
        subject_id=decision.id,
        mention_person_ids=tuple(p.person_id for p in nudge.non_responders),
        title=es_ar.MISSING_VOTES_TITLE,
        url_path=dates_page_path(trip.crew_id, trip.id),
    )


def missing_votes_rule(ctx: ReminderContext) -> Iterable[ReminderDraft]:
    nudges = due_nudges(
        ctx.now,
        DjangoDecisionStore(),
        CoreTripGateway(),
        window_hours=conf.nudge_window_hours(),
        after_days=conf.nudge_after_days(),
    )
    return [draft_for(n) for n in nudges]


def register() -> None:
    reminders.register_reminder_rule(RULE_KEY, missing_votes_rule)
