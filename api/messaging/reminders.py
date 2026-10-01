"""Reminder rule registry (pure; no Django).

Milestones register rules from ``AppConfig.ready()``. The ``tick`` job runs every rule for each
active trip; a rule yields the drafts that are due *now*. Rules must be idempotent: the same
reminder always carries the same ``dedupe_key``, so re-running a tick never sends it twice (and a
draft skipped during quiet hours is simply produced again by a later tick).
"""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

DEFAULT_QUIET_HOURS = (22, 9)  # local hours: quiet from 22:00 until 09:00


@dataclass(frozen=True)
class ReminderContext:
    now: datetime  # timezone-aware, UTC
    trip_id: str
    crew_id: str
    chat_id: str  # the crew's WhatsApp group JID
    trip_timezone: str  # IANA name
    trip_start_on: date | None
    trip_end_on: date | None
    quiet_hours: tuple[int, int] = DEFAULT_QUIET_HOURS


@dataclass(frozen=True)
class ReminderDraft:
    to_jid: str
    body: str
    dedupe_key: str
    subject_type: str
    subject_id: str
    kind: str = "reminder"


ReminderRule = Callable[[ReminderContext], Iterable[ReminderDraft]]

_REGISTRY: dict[str, ReminderRule] = {}


def register_reminder_rule(key: str, rule: ReminderRule) -> None:
    """Register ``rule`` under ``key``. The same pair again is a no-op; a different rule raises."""
    existing = _REGISTRY.get(key)
    if existing is None:
        _REGISTRY[key] = rule
    elif existing is not rule:
        raise ValueError(f"reminder rule {key!r} is already registered")


def registered_rules() -> list[tuple[str, ReminderRule]]:
    return list(_REGISTRY.items())


def clear() -> None:
    """Drop every rule (tests)."""
    _REGISTRY.clear()


def in_quiet_hours(now: datetime, timezone: str, quiet_hours: tuple[int, int]) -> bool:
    """Whether ``now`` falls in ``[start, end)`` local hours of ``timezone`` (may wrap midnight)."""
    start, end = quiet_hours
    hour = now.astimezone(ZoneInfo(timezone)).hour
    if start <= end:
        return start <= hour < end
    return hour >= start or hour < end
