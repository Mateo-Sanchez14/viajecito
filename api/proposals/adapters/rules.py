from messaging.reminders import ReminderContext, ReminderDraft
from proposals import conf
from proposals.adapters import wiring
from proposals.use_cases.majority_suggestions import majority_drafts
from trips.use_cases.list_active_trips import list_active_trips


def majority_rule(ctx: ReminderContext) -> list[ReminderDraft]:
    """The ``proposals.majority`` reminder rule: a pure read over the active trips."""
    return majority_drafts(wiring.store(), list_active_trips(), public_origin=conf.public_origin())
