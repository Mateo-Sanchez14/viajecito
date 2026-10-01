from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from ninja import Field, Schema

Country = Literal["AR", "CL"]
Discipline = Literal["ski", "snowboard", "both"]
Level = Literal["first_time", "beginner", "intermediate", "advanced", "expert"]
PassStatus = Literal["needed", "bought", "season_pass", "not_needed"]
GearItem = Literal[
    "skis", "board", "boots", "poles", "helmet", "goggles", "jacket", "pants", "other"
]
GearMode = Literal["own", "rent", "borrow"]


class PersonRefOut(Schema):
    person_id: UUID
    display_name: str


class ResortOut(Schema):
    id: UUID
    slug: str
    name: str
    country: str
    region: str
    lat: float
    lng: float
    base_elev_m: int
    summit_elev_m: int
    website_url: str


class SnowReportOut(Schema):
    id: UUID
    source: str
    observed_at: datetime
    fetched_at: datetime
    base_cm: int | None
    new_24h_cm: float | None
    forecast_72h_cm: float | None
    temp_c: float | None
    lifts_open: int | None
    lifts_total: int | None
    runs_open: int | None
    runs_total: int | None
    status_text: str
    reporter: PersonRefOut | None
    stale: bool
    age_hours: int


class TripResortOut(Schema):
    resort: ResortOut
    nights: int | None
    position: int
    latest_report: SnowReportOut | None


class ConditionsResortOut(Schema):
    resort_id: UUID
    name: str
    latest_report: SnowReportOut | None


class SkiConditionsOut(Schema):
    resorts: list[ConditionsResortOut]


class PassRowOut(Schema):
    person: PersonRefOut
    resort_id: UUID | None
    product: str
    days: int | None
    status: str
    price: str | None
    currency: str


class MissingPassOut(Schema):
    person: PersonRefOut
    resort_id: UUID | None


class PassSummaryOut(Schema):
    rows: list[PassRowOut]
    missing: list[MissingPassOut]


class GearRowOut(Schema):
    person: PersonRefOut
    item: str
    mode: str
    price: str | None
    currency: str
    note: str


class SizeOut(Schema):
    person: PersonRefOut
    boot_size_eu: float | None
    height_cm: int | None
    weight_kg: int | None


class GearRollupOut(Schema):
    rows: list[GearRowOut]
    rent_counts: dict[str, int]
    sizes: list[SizeOut]
    sizes_hidden: int


class LevelGroupOut(Schema):
    discipline: str
    level: str
    people: list[PersonRefOut]


class SkiOverviewOut(Schema):
    resorts: list[TripResortOut]
    passes: PassSummaryOut
    gear: GearRollupOut
    levels: list[LevelGroupOut]


class TripResortIn(Schema):
    resort_id: UUID
    nights: int | None = Field(None, ge=0, le=365)


class TripResortPatchIn(Schema):
    """Only the fields sent are applied."""

    nights: int | None = Field(None, ge=0, le=365)
    position: int = Field(None, ge=0, le=1000)  # may be left out, never null


class ManualReportIn(Schema):
    base_cm: int | None = Field(None, ge=0, le=1000)
    new_24h_cm: Decimal | None = Field(None, ge=0, le=300, decimal_places=1)
    temp_c: Decimal | None = Field(None, ge=-40, le=30, decimal_places=1)
    lifts_open: int | None = Field(None, ge=0, le=500)
    lifts_total: int | None = Field(None, ge=0, le=500)
    runs_open: int | None = Field(None, ge=0, le=500)
    runs_total: int | None = Field(None, ge=0, le=500)
    status_text: str = Field("", max_length=1000)


class PassIn(Schema):
    resort_id: UUID | None = None
    product: str = Field("", max_length=120)
    days: int | None = Field(None, ge=1, le=365)
    status: PassStatus
    price: Decimal | None = Field(None, ge=0, le=Decimal("9999999999.99"))
    currency: str | None = Field(None, max_length=8)


class GearItemIn(Schema):
    item: GearItem
    mode: GearMode
    price: Decimal | None = Field(None, ge=0, le=Decimal("9999999999.99"))
    currency: str | None = Field(None, max_length=8)
    note: str = Field("", max_length=200)


class GearIn(Schema):
    items: list[GearItemIn] = Field(max_length=len(GearItem.__args__))


class SkiProfileIn(Schema):
    discipline: Discipline = "ski"
    level: Level = "beginner"
    owns_gear: bool = False
    boot_size_eu: Decimal | None = Field(None, ge=30, le=50, decimal_places=1)
    height_cm: int | None = Field(None, ge=100, le=230)
    weight_kg: int | None = Field(None, ge=25, le=200)
    share_sizes_with_trip: bool = False


class SkiProfileOut(Schema):
    discipline: str
    level: str
    owns_gear: bool
    boot_size_eu: float | None
    height_cm: int | None
    weight_kg: int | None
    share_sizes_with_trip: bool
