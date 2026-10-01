"""Queue the drafts the registered reminder rules produce (one phase of the ``tick`` job)."""

import logging
import re
from collections.abc import Callable, Mapping
from contextlib import AbstractContextManager
from dataclasses import dataclass
from datetime import datetime

from messaging import reminders
from messaging.copy import es_ar
from messaging.ports import ChatDirectory, OutboundLedger, PersonDirectory, PersonRef
from shared.phone import phone_to_jid

logger = logging.getLogger(__name__)

_TOKEN = re.compile(r"\{@([^{}]+)\}")


@dataclass(frozen=True)
class RemindersResult:
    queued: int = 0
    quiet: int = 0
    errors: int = 0


def render_mentions(
    body: str,
    mention_person_ids: tuple[str, ...],
    people: Mapping[str, PersonRef],
    *,
    mentions_enabled: bool,
) -> tuple[str, list[str]]:
    """Render ``{@<person_id>}`` tokens and return ``(text, jids to @-mention)``.

    Mentions off (the default): a token becomes the person's display name (their phone when they
    have none), an unknown id becomes a neutral word, and no JIDs are passed.
    Mentions on: a known token becomes ``@<digits>`` and every mentioned person's JID is returned.
    """

    def render(match: re.Match[str]) -> str:
        person = people.get(match.group(1))
        if person is None:
            return es_ar.UNKNOWN_PERSON
        return f"@{person.phone.lstrip('+')}" if mentions_enabled else person.name

    text = _TOKEN.sub(render, body)
    if not mentions_enabled:
        return text, []
    ids = list(dict.fromkeys([*_TOKEN.findall(body), *mention_person_ids]))
    return text, [phone_to_jid(people[i].phone) for i in ids if i in people]


def queue_reminders(
    *,
    chats: ChatDirectory,
    people: PersonDirectory,
    ledger: OutboundLedger,
    atomic: Callable[[], AbstractContextManager],
    now: datetime,
    mentions_enabled: bool = False,
) -> RemindersResult:
    """Run every rule and queue its drafts as ``OutboundMessage(kind="reminder")`` rows.

    Quiet-hours drafts (``respect_quiet_hours``) are skipped; a later tick produces them again.
    The persisted key is ``"<rule key>:<draft dedupe_key>"``. For NEW rows only, the rule's
    ``on_queued`` runs in the same transaction as the row (a failure rolls the row back, so the
    next tick retries), then every channel runs outside it. Failures are logged and counted.
    """
    queued = quiet = errors = 0
    ctx = reminders.ReminderContext(now=now)
    for rule in reminders.registered_rules():
        try:
            drafts = list(rule.fn(ctx))
        except Exception:
            logger.exception("reminder rule %s failed", rule.key)
            errors += 1
            continue
        for draft in drafts:
            try:
                if draft.respect_quiet_hours and reminders.is_quiet_time(now, draft.timezone):
                    quiet += 1
                    continue
                chat_id = chats.chat_id_for_crew(draft.crew_id)
                if chat_id is None:
                    continue
                ids = list(dict.fromkeys([*_TOKEN.findall(draft.body), *draft.mention_person_ids]))
                body, jids = render_mentions(
                    draft.body,
                    draft.mention_person_ids,
                    people.people(ids) if ids else {},
                    mentions_enabled=mentions_enabled,
                )
                with atomic():
                    entry = ledger.reserve(
                        to_jid=chat_id,
                        kind="reminder",
                        body=body,
                        dedupe_key=f"{rule.key}:{draft.dedupe_key}",
                        reply_to=None,
                        subject_type=draft.subject_type,
                        subject_id=draft.subject_id,
                        mentions=jids,
                    )
                    if entry.created and rule.on_queued is not None:
                        rule.on_queued(draft)
            except Exception:
                logger.exception("reminder from rule %s failed", rule.key)
                errors += 1
                continue
            if not entry.created:
                continue
            queued += 1
            for name, deliver in reminders.registered_channels():
                try:
                    deliver(draft)
                except Exception:
                    logger.exception("reminder channel %s failed for rule %s", name, rule.key)
                    errors += 1
    return RemindersResult(queued=queued, quiet=quiet, errors=errors)
