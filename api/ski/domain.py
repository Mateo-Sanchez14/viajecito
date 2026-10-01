"""Pure ski rules (no Django, no HTTP)."""

import re
import unicodedata
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
    owns_gear: bool = False


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


class InvalidSkiInputError(ValueError):
    """A ski field is not acceptable."""


class UsageError(ValueError):
    """The ``/viaje nieve`` arguments do not parse."""


@dataclass(frozen=True)
class PersonRef:
    person_id: str
    display_name: str


@dataclass(frozen=True)
class TripInfo:
    id: str
    crew_id: str
    type: str
    currency: str
    timezone: str
    name: str


@dataclass(frozen=True)
class ResortData:
    id: str
    slug: str
    name: str
    country: str
    region: str
    lat: Decimal
    lng: Decimal
    base_elev_m: int
    summit_elev_m: int
    website_url: str


@dataclass(frozen=True)
class TripResortData:
    resort: ResortData
    nights: int | None
    position: int


@dataclass(frozen=True)
class ReportData:
    id: str
    resort_id: str
    source: str
    observed_at: datetime
    fetched_at: datetime
    base_cm: int | None
    new_24h_cm: Decimal | None
    forecast_72h_cm: Decimal | None
    temp_c: Decimal | None
    lifts_open: int | None
    lifts_total: int | None
    runs_open: int | None
    runs_total: int | None
    status_text: str
    reporter: PersonRef | None


@dataclass(frozen=True)
class ReportView:
    report: ReportData
    stale: bool
    age_hours: int


@dataclass(frozen=True)
class Conditions:
    trip_resort: TripResortData
    latest: ReportView | None


@dataclass(frozen=True)
class ManualReportInput:
    base_cm: int | None = None
    new_24h_cm: Decimal | None = None
    temp_c: Decimal | None = None
    lifts_open: int | None = None
    lifts_total: int | None = None
    runs_open: int | None = None
    runs_total: int | None = None
    status_text: str = ""


_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f\u2028\u2029]")
MAX_STATUS_TEXT = 280


def view_report(report: ReportData, now: datetime) -> ReportView:
    return ReportView(
        report=report,
        stale=is_stale(report.observed_at, now),
        age_hours=age_hours(report.observed_at, now),
    )


def clean_text(text: str, limit: int) -> str:
    """Strip control characters (newlines and tabs become spaces), collapse blanks, bound."""
    spaced = text.replace("\n", " ").replace("\r", " ").replace("\t", " ")
    return " ".join(_CONTROL_CHARS.sub("", spaced).split())[:limit]


def _in_range(name: str, value: int | Decimal | None, low: int, high: int) -> None:
    if value is not None and not low <= value <= high:
        raise InvalidSkiInputError(f"{name} must be between {low} and {high}")


def validate_manual_report(report: ManualReportInput) -> ManualReportInput:
    """Bounded manual report with at least one field; ``status_text`` is cleaned."""
    _in_range("base_cm", report.base_cm, 0, 1000)
    _in_range("new_24h_cm", report.new_24h_cm, 0, 300)
    _in_range("temp_c", report.temp_c, -40, 30)
    for name in ("lifts_open", "lifts_total", "runs_open", "runs_total"):
        _in_range(name, getattr(report, name), 0, 500)
    for opened, total in (("lifts_open", "lifts_total"), ("runs_open", "runs_total")):
        a, b = getattr(report, opened), getattr(report, total)
        if a is not None and b is not None and a > b:
            raise InvalidSkiInputError(f"{opened} must not exceed {total}")
    text = clean_text(report.status_text, MAX_STATUS_TEXT)
    cleaned = ManualReportInput(
        base_cm=report.base_cm,
        new_24h_cm=report.new_24h_cm,
        temp_c=report.temp_c,
        lifts_open=report.lifts_open,
        lifts_total=report.lifts_total,
        runs_open=report.runs_open,
        runs_total=report.runs_total,
        status_text=text,
    )
    if all(v in (None, "") for v in vars(cleaned).values()):
        raise InvalidSkiInputError("a manual report needs at least one field")
    return cleaned


def fold(text: str) -> str:
    """Accent- and case-insensitive form used to match resort names."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold().strip()


def match_resort(query: str, resorts: list[ResortData]) -> ResortData | None:
    """The one resort whose name or slug starts with ``query`` at a word boundary
    (``catedral`` -> Cerro Catedral); ``None`` when nothing or more than one matches. An exact
    name/slug match always wins."""
    wanted = " ".join(fold(query).replace("-", " ").split())
    if not wanted:
        return None

    def words(resort: ResortData) -> list[list[str]]:
        names = (fold(resort.name), fold(resort.slug).replace("-", " "))
        return [n.split() for n in names]

    exact = [r for r in resorts if any(" ".join(w) == wanted for w in words(r))]
    if len(exact) == 1:
        return exact[0]
    found = [
        r
        for r in resorts
        if any(" ".join(w[i:]).startswith(wanted) for w in words(r) for i in range(len(w)))
    ]
    return found[0] if len(found) == 1 else None


@dataclass(frozen=True)
class NieveArgs:
    resort_query: str
    base_cm: int
    new_24h_cm: int | None


def parse_nieve_args(args: str) -> NieveArgs:
    """``<resort words> <base_cm> [nuevos_cm]``; raises ``UsageError`` on anything else."""
    tokens = args.split()
    numbers: list[int] = []
    while tokens and len(numbers) < 2 and re.fullmatch(r"\d{1,5}", tokens[-1]):
        numbers.insert(0, int(tokens.pop()))
    if not numbers or not tokens:
        raise UsageError(args)
    base = numbers[0]
    new = numbers[1] if len(numbers) == 2 else None
    try:
        validate_manual_report(ManualReportInput(base_cm=base, new_24h_cm=new and Decimal(new)))
    except InvalidSkiInputError as exc:
        raise UsageError(args) from exc
    return NieveArgs(" ".join(tokens), base, new)


class ResortAlreadyAddedError(Exception):
    """The resort is already on the trip."""


class ResortNotFoundError(LookupError):
    """No active resort with that id."""


MAX_PRICE = Decimal("9999999999.99")
_CENT = Decimal("0.01")


def normalize_currency(raw: str) -> str:
    cleaned = raw.strip().upper()
    if len(cleaned) != 3 or not (cleaned.isascii() and cleaned.isalpha()):
        raise InvalidSkiInputError("currency must be a 3-letter code")
    return cleaned


def _price(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    if not value.is_finite() or value < 0 or value > MAX_PRICE:
        raise InvalidSkiInputError("price must be between 0 and 9999999999.99")
    return value.quantize(_CENT)


@dataclass(frozen=True)
class PassInput:
    resort_id: str | None
    status: str
    product: str = ""
    days: int | None = None
    price: Decimal | None = None
    currency: str | None = None  # None -> the trip currency


def validate_pass(item: PassInput, default_currency: str) -> PassInput:
    if item.status not in PASS_STATUSES:
        raise InvalidSkiInputError("unknown pass status")
    if item.days is not None and not 1 <= item.days <= 365:
        raise InvalidSkiInputError("days must be between 1 and 365")
    return PassInput(
        resort_id=item.resort_id,
        status=item.status,
        product=clean_text(item.product, 120),
        days=item.days,
        price=_price(item.price),
        currency=normalize_currency(item.currency or default_currency),
    )


@dataclass(frozen=True)
class GearInput:
    item: str
    mode: str
    price: Decimal | None = None
    currency: str | None = None
    note: str = ""


def validate_gear(items: list[GearInput], default_currency: str) -> list[GearInput]:
    seen: set[str] = set()
    clean = []
    for entry in items:
        if entry.item not in GEAR_ITEMS or entry.mode not in GEAR_MODES:
            raise InvalidSkiInputError("unknown gear item or mode")
        if entry.item in seen:
            raise InvalidSkiInputError(f"gear item {entry.item!r} appears twice")
        seen.add(entry.item)
        clean.append(
            GearInput(
                item=entry.item,
                mode=entry.mode,
                price=_price(entry.price),
                currency=normalize_currency(entry.currency or default_currency),
                note=clean_text(entry.note, 200),
            )
        )
    return clean


@dataclass(frozen=True)
class ProfileInput:
    discipline: str = "ski"
    level: str = "beginner"
    owns_gear: bool = False
    boot_size_eu: Decimal | None = None
    height_cm: int | None = None
    weight_kg: int | None = None
    share_sizes_with_trip: bool = False


def validate_profile(profile: ProfileInput) -> ProfileInput:
    if profile.discipline not in DISCIPLINES or profile.level not in LEVELS:
        raise InvalidSkiInputError("unknown discipline or level")
    _in_range("boot_size_eu", profile.boot_size_eu, 30, 50)
    _in_range("height_cm", profile.height_cm, 100, 230)
    _in_range("weight_kg", profile.weight_kg, 25, 200)
    boot = None if profile.boot_size_eu is None else profile.boot_size_eu.quantize(Decimal("0.1"))
    return ProfileInput(
        profile.discipline,
        profile.level,
        profile.owns_gear,
        boot,
        profile.height_cm,
        profile.weight_kg,
        profile.share_sizes_with_trip,
    )
