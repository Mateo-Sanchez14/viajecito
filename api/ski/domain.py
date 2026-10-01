"""Pure ski rules (no Django, no HTTP)."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

STALE_AFTER = timedelta(hours=12)
REFRESH_EVERY = timedelta(hours=3)
BACKOFF_BASE = timedelta(minutes=15)
BACKOFF_CAP = timedelta(hours=6)
MAX_RESORTS_PER_TICK = 4
ACTIVE_TRIP_STATUSES = ("planning", "booked", "ongoing")
PROVIDER_RETENTION = timedelta(days=30)


def is_stale(observed_at: datetime, now: datetime) -> bool:
    """A report older than 12 hours (strictly) renders as stale."""
    return now - observed_at > STALE_AFTER


def age_hours(observed_at: datetime, now: datetime) -> int:
    """Whole hours since ``observed_at`` (never negative)."""
    return max(int((now - observed_at).total_seconds() // 3600), 0)


def backoff_delay(consecutive_failures: int) -> timedelta:
    """15 min, 30 min, 1 h ... capped at 6 h after the n-th consecutive failure (n >= 1)."""
    exponent = min(max(consecutive_failures, 1) - 1, 10)
    return min(BACKOFF_BASE * 2**exponent, BACKOFF_CAP)


def is_due(
    now: datetime,
    *,
    last_success_at: datetime | None,
    next_attempt_at: datetime | None,
) -> bool:
    """Refresh a resort when its backoff window is over and the last success is >= 3 h old."""
    if next_attempt_at is not None and next_attempt_at > now:
        return False
    return last_success_at is None or now - last_success_at >= REFRESH_EVERY


DISCIPLINES = ("ski", "snowboard", "both")
LEVELS = ("first_time", "beginner", "intermediate", "advanced", "expert")
GEAR_ITEMS = ("skis", "board", "boots", "poles", "helmet", "goggles", "jacket", "pants", "other")
GEAR_MODES = ("own", "rent", "borrow")
PASS_STATUSES = ("needed", "bought", "season_pass", "not_needed")
GOING_RSVPS = ("in", "maybe")  # participants who count for passes, gear and levels


@dataclass(frozen=True)
class Participant:
    person_id: str
    display_name: str
    rsvp: str


@dataclass(frozen=True)
class PassRecord:
    person_id: str
    resort_id: str | None
    product: str
    days: int | None
    status: str
    price: Decimal | None
    currency: str


@dataclass(frozen=True)
class GearRecord:
    person_id: str
    item: str
    mode: str
    price: Decimal | None
    currency: str
    note: str


@dataclass(frozen=True)
class ProfileRecord:
    person_id: str
    discipline: str
    level: str
    boot_size_eu: Decimal | None
    height_cm: int | None
    weight_kg: int | None
    share_sizes_with_trip: bool


@dataclass(frozen=True)
class MissingPass:
    person_id: str
    resort_id: str | None


@dataclass(frozen=True)
class SizeEntry:
    person_id: str
    boot_size_eu: Decimal | None
    height_cm: int | None
    weight_kg: int | None


@dataclass(frozen=True)
class RentalRollup:
    rent_counts: dict[str, int]
    sizes: list[SizeEntry]
    sizes_hidden: int


@dataclass(frozen=True)
class LevelGroup:
    discipline: str
    level: str
    person_ids: list[str]


def missing_passes(
    participants: list[Participant], resort_ids: list[str], passes: list[PassRecord]
) -> list[MissingPass]:
    """Who still needs a pass, per trip resort ("quien no tiene pase").

    Only ``in``/``maybe`` participants count. For each resort a person's own row decides; without
    one, their resort-less row ("any resort") does. ``needed`` or no row at all means missing;
    ``bought``, ``season_pass`` and ``not_needed`` do not. A trip without resorts is judged on the
    resort-less rows alone (``resort_id=None``).
    """
    by_person: dict[str, dict[str | None, PassRecord]] = {}
    for record in passes:
        by_person.setdefault(record.person_id, {})[record.resort_id] = record
    targets: list[str | None] = list(resort_ids) or [None]
    missing = []
    for person in participants:
        if person.rsvp not in GOING_RSVPS:
            continue
        rows = by_person.get(person.person_id, {})
        for target in targets:
            row = rows.get(target) or rows.get(None)
            if row is None or row.status == "needed":
                missing.append(MissingPass(person.person_id, target))
    return missing


def rental_rollup(gear: list[GearRecord], profiles: list[ProfileRecord]) -> RentalRollup:
    """Rentals per item, and the sizes of renters who consented to share them. Renters who did not
    (or have no profile) are only counted in ``sizes_hidden``."""
    counts: dict[str, int] = {}
    renters: list[str] = []
    for row in gear:
        if row.mode != "rent":
            continue
        counts[row.item] = counts.get(row.item, 0) + 1
        if row.person_id not in renters:
            renters.append(row.person_id)
    by_person = {p.person_id: p for p in profiles}
    sizes, hidden = [], 0
    for person_id in renters:
        profile = by_person.get(person_id)
        if profile is not None and profile.share_sizes_with_trip:
            sizes.append(
                SizeEntry(person_id, profile.boot_size_eu, profile.height_cm, profile.weight_kg)
            )
        else:
            hidden += 1
    return RentalRollup(rent_counts=counts, sizes=sizes, sizes_hidden=hidden)


def level_groups(
    participants: list[Participant], profiles: list[ProfileRecord]
) -> list[LevelGroup]:
    """Going participants with a profile, grouped by (discipline, level) from beginners up."""
    by_person = {p.person_id: p for p in profiles}
    groups: dict[tuple[str, str], list[str]] = {}
    for person in participants:
        profile = by_person.get(person.person_id)
        if person.rsvp in GOING_RSVPS and profile is not None:
            groups.setdefault((profile.discipline, profile.level), []).append(person.person_id)
    ordered = sorted(groups, key=lambda k: (DISCIPLINES.index(k[0]), LEVELS.index(k[1])))
    return [LevelGroup(discipline=d, level=lv, person_ids=groups[(d, lv)]) for d, lv in ordered]
