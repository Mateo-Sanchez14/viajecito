"""Reminder rules, delivery channels, tick jobs and digest sections (pure; no Django).

Milestones register what they contribute from ``AppConfig.ready()``:

- ``register_reminder_rule(key, fn, on_queued=None)``: ``fn(ctx)`` is a PURE READ returning the
  ``ReminderDraft`` s that are due at ``ctx.now`` (rules look at the trips they care about
  themselves). All writes belong in ``on_queued(draft)``, which the tick calls only when the
  group message row is NEW, inside the same transaction.
- ``register_channel(name, deliver)``: ``deliver(draft)`` is called for every new reminder too
  (e.g. web push); a failing channel never un-queues the group message.
- ``register_tick_job(key, fn)``: ``fn(now)`` runs once per tick, after delivery; it may return
  ``{counter: int}``.
- ``register_digest_section(key, fn, order=...)``: ``fn(trip_id, local_date)`` returns one block
  of copy (or ``None``); ``digest_sections`` collects them for the morning digest.

Rules must be idempotent: a reminder always carries the same ``dedupe_key``. The tick persists it
as ``"<rule key>:<dedupe_key>"`` so rules never share a key space; milestones never prefix their own
keys. A draft skipped during quiet hours is simply produced again by a later tick.
"""

import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

QUIET_START = time(22, 0)  # local trip time, inclusive
QUIET_END = time(9, 0)  # local trip time, exclusive


@dataclass(frozen=True)
class ReminderDraft:
    crew_id: str  # core resolves the group chat from WhatsAppGroupLink
    trip_id: str | None
    body: str  # final voseo copy (<= 4000 chars); may contain {@<person_id>} tokens
    dedupe_key: str  # <= 200 chars once prefixed with the rule key; unique per reminder
    timezone: str  # IANA name used for quiet hours (normally Trip.timezone)
    subject_type: str = ""
    subject_id: str = ""
    mention_person_ids: tuple[str, ...] = ()
    title: str = ""  # short title for non-group channels (push)
    url_path: str = ""  # same-origin path to open, e.g. "/crews/<c>/trips/<t>/logistics"
    respect_quiet_hours: bool = True


@dataclass(frozen=True)
class ReminderContext:
    now: datetime  # aware UTC; tests pass a FrozenClock instant


RuleFn = Callable[[ReminderContext], Iterable[ReminderDraft]]
OnQueued = Callable[[ReminderDraft], None]
ChannelFn = Callable[[ReminderDraft], None]
TickJob = Callable[[datetime], dict[str, int] | None]
DigestSection = Callable[[str, date], str | None]  # (trip_id, local_date) -> one block of copy


@dataclass(frozen=True)
class RegisteredRule:
    key: str
    fn: RuleFn
    on_queued: OnQueued | None


_RULES: dict[str, RegisteredRule] = {}
_CHANNELS: dict[str, ChannelFn] = {}
_JOBS: dict[str, TickJob] = {}
_SECTIONS: dict[str, tuple[int, DigestSection]] = {}


def register_reminder_rule(key: str, fn: RuleFn, *, on_queued: OnQueued | None = None) -> None:
    """The same ``(key, fn, on_queued)`` again is a no-op; any other use of ``key`` raises."""
    rule = RegisteredRule(key, fn, on_queued)
    existing = _RULES.setdefault(key, rule)
    if existing != rule:
        raise ValueError(f"reminder rule {key!r} is already registered")


def register_channel(name: str, deliver: ChannelFn) -> None:
    if _CHANNELS.setdefault(name, deliver) is not deliver:
        raise ValueError(f"reminder channel {name!r} is already registered")


def register_tick_job(key: str, fn: TickJob) -> None:
    if _JOBS.setdefault(key, fn) is not fn:
        raise ValueError(f"tick job {key!r} is already registered")


def register_digest_section(key: str, fn: DigestSection, *, order: int = 100) -> None:
    if _SECTIONS.setdefault(key, (order, fn)) != (order, fn):
        raise ValueError(f"digest section {key!r} is already registered")


def registered_rules() -> list[RegisteredRule]:
    return list(_RULES.values())


def registered_channels() -> list[tuple[str, ChannelFn]]:
    return list(_CHANNELS.items())


def registered_tick_jobs() -> list[tuple[str, TickJob]]:
    return list(_JOBS.items())


def digest_sections(trip_id: str, local_date: date) -> list[str]:
    """Blocks of copy by ascending ``order`` (registration order for ties); ``None`` blocks are
    dropped and a failing section is logged and skipped."""
    blocks: list[str] = []
    for key, (_, fn) in sorted(_SECTIONS.items(), key=lambda item: item[1][0]):
        try:
            block = fn(trip_id, local_date)
        except Exception:
            logger.exception("digest section %s failed for trip %s", key, trip_id)
            continue
        if block:
            blocks.append(block)
    return blocks


def clear() -> None:
    """Drop every registration (tests)."""
    _RULES.clear()
    _CHANNELS.clear()
    _JOBS.clear()
    _SECTIONS.clear()


def is_quiet_time(now: datetime, tz: str) -> bool:
    """Whether ``now`` is in the quiet window [``QUIET_START``, ``QUIET_END``) in ``tz``."""
    local = now.astimezone(ZoneInfo(tz)).time()
    if QUIET_START <= QUIET_END:
        return QUIET_START <= local < QUIET_END
    return local >= QUIET_START or local < QUIET_END
