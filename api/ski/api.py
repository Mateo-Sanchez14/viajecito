"""Ski endpoints: ``/api/ski/resorts``, ``/api/trips/{id}/ski/...``, ``/api/me/ski_profile``."""

from datetime import UTC, datetime
from decimal import Decimal
from http import HTTPStatus
from typing import Literal
from uuid import UUID

from django.http import HttpRequest
from ninja import Router, Status
from ninja.security import django_auth

from crews.api_auth import current_person
from shared.api_errors import ApiError, ErrorOut
from ski import conf, domain
from ski.adapters.django_store import DjangoSkiStore
from ski.domain import Conditions, PersonRef, ReportView
from ski.schemas import (
    ConditionsResortOut,
    GearIn,
    GearRollupOut,
    GearRowOut,
    LevelGroupOut,
    ManualReportIn,
    MissingPassOut,
    PassIn,
    PassRowOut,
    PassSummaryOut,
    PersonRefOut,
    ResortOut,
    SizeOut,
    SkiConditionsOut,
    SkiOverviewOut,
    SkiProfileIn,
    SkiProfileOut,
    SnowReportOut,
    TripResortIn,
    TripResortOut,
    TripResortPatchIn,
)
from ski.use_cases import gear as gear_use_cases
from ski.use_cases import manual_report, passes, profile, reports, trip_resorts
from ski.use_cases.access import ski_enabled
from ski.use_cases.conditions import trip_conditions
from ski.use_cases.overview import ski_overview
from trips.api_auth import TripAccess, member_of_trip

router = Router(tags=["ski"])

ERRORS = {
    HTTPStatus.BAD_REQUEST: ErrorOut,
    HTTPStatus.UNAUTHORIZED: ErrorOut,
    HTTPStatus.FORBIDDEN: ErrorOut,
    HTTPStatus.NOT_FOUND: ErrorOut,
}


def store() -> DjangoSkiStore:
    return DjangoSkiStore()


def now() -> datetime:
    return datetime.now(UTC)


def ski_access(request: HttpRequest, trip_id: UUID) -> TripAccess:
    """Authorize against the trip, then require the ``ski`` module (``module_not_enabled``)."""
    access = member_of_trip(request, trip_id)
    if not ski_enabled(access.trip.type):
        raise ApiError(404, "module_not_enabled", "This trip does not have the ski module")
    return access


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found")


def invalid(message: str) -> ApiError:
    return ApiError(HTTPStatus.BAD_REQUEST, "invalid_request", message)


def money(value: Decimal | None) -> str | None:
    return None if value is None else f"{value:.2f}"


def _float(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


def person_out(person_id: str, people: dict[str, str]) -> PersonRefOut:
    return PersonRefOut(person_id=UUID(person_id), display_name=people.get(person_id, ""))


def report_out(view: ReportView) -> SnowReportOut:
    r = view.report
    reporter = r.reporter
    return SnowReportOut(
        id=UUID(r.id),
        source=r.source,
        observed_at=r.observed_at,
        fetched_at=r.fetched_at,
        base_cm=r.base_cm,
        new_24h_cm=_float(r.new_24h_cm),
        forecast_72h_cm=_float(r.forecast_72h_cm),
        temp_c=_float(r.temp_c),
        lifts_open=r.lifts_open,
        lifts_total=r.lifts_total,
        runs_open=r.runs_open,
        runs_total=r.runs_total,
        status_text=r.status_text,
        reporter=reporter and PersonRefOut(**_ref(reporter)),
        stale=view.stale,
        age_hours=view.age_hours,
    )


def _ref(person: PersonRef) -> dict:
    return {"person_id": UUID(person.person_id), "display_name": person.display_name}


def resort_out(resort: domain.ResortData) -> ResortOut:
    return ResortOut(
        id=UUID(resort.id),
        slug=resort.slug,
        name=resort.name,
        country=resort.country,
        region=resort.region,
        lat=float(resort.lat),
        lng=float(resort.lng),
        base_elev_m=resort.base_elev_m,
        summit_elev_m=resort.summit_elev_m,
        website_url=resort.website_url,
    )


def trip_resort_out(item: Conditions) -> TripResortOut:
    return TripResortOut(
        resort=resort_out(item.trip_resort.resort),
        nights=item.trip_resort.nights,
        position=item.trip_resort.position,
        latest_report=report_out(item.latest) if item.latest else None,
    )


# --- resorts ------------------------------------------------------------------------------


@router.get(
    "/ski/resorts",
    response={
        HTTPStatus.OK: list[ResortOut],
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
    },
    auth=django_auth,
    summary="List Ski Resorts",
)
def list_resorts(request, country: Literal["AR", "CL"] | None = None):
    """Active seeded resorts, for any authenticated person."""
    return Status(HTTPStatus.OK, [resort_out(r) for r in store().list_resorts(country)])


@router.post(
    "/trips/{trip_id}/ski/resorts",
    response={
        HTTPStatus.CREATED: TripResortOut,
        HTTPStatus.CONFLICT: ErrorOut,
        **ERRORS,
    },
    auth=django_auth,
    summary="Add Trip Resort",
)
def add_trip_resort(request, trip_id: UUID, payload: TripResortIn):
    """400 `invalid_request` (unknown resort). 409 `resort_already_added`."""
    ski_access(request, trip_id)
    try:
        item = trip_resorts.add_trip_resort(
            str(trip_id), str(payload.resort_id), payload.nights, now(), store()
        )
    except domain.ResortNotFoundError as exc:
        raise invalid("unknown resort") from exc
    except domain.ResortAlreadyAddedError as exc:
        raise ApiError(HTTPStatus.CONFLICT, "resort_already_added", "Already on the trip") from exc
    return Status(HTTPStatus.CREATED, trip_resort_out(item))


@router.patch(
    "/trips/{trip_id}/ski/resorts/{resort_id}",
    response={HTTPStatus.OK: TripResortOut, **ERRORS},
    auth=django_auth,
    summary="Update Trip Resort",
)
def update_trip_resort(request, trip_id: UUID, resort_id: UUID, payload: TripResortPatchIn):
    ski_access(request, trip_id)
    try:
        item = trip_resorts.update_trip_resort(
            str(trip_id),
            str(resort_id),
            payload.model_dump(exclude_unset=True),
            now(),
            store(),
        )
    except trip_resorts.ResortNotOnTripError as exc:
        raise not_found() from exc
    return Status(HTTPStatus.OK, trip_resort_out(item))


@router.delete(
    "/trips/{trip_id}/ski/resorts/{resort_id}",
    response={HTTPStatus.NO_CONTENT: None, **ERRORS},
    auth=django_auth,
    summary="Remove Trip Resort",
)
def remove_trip_resort(request, trip_id: UUID, resort_id: UUID):
    """Snow reports of the resort are kept."""
    ski_access(request, trip_id)
    try:
        trip_resorts.remove_trip_resort(str(trip_id), str(resort_id), store())
    except trip_resorts.ResortNotOnTripError as exc:
        raise not_found() from exc
    return Status(HTTPStatus.NO_CONTENT, None)


# --- conditions and reports ----------------------------------------------------------------


@router.get(
    "/trips/{trip_id}/ski",
    response={HTTPStatus.OK: SkiOverviewOut, **ERRORS},
    auth=django_auth,
    summary="Get Ski Overview",
)
def get_overview(request, trip_id: UUID):
    ski_access(request, trip_id)
    data = ski_overview(str(trip_id), now(), store())
    people = data.people
    sizes = [
        SizeOut(
            person=person_out(s.person_id, people),
            boot_size_eu=_float(s.boot_size_eu),
            height_cm=s.height_cm,
            weight_kg=s.weight_kg,
        )
        for s in data.rollup.sizes
    ]
    return Status(
        HTTPStatus.OK,
        SkiOverviewOut(
            resorts=[trip_resort_out(c) for c in data.resorts],
            passes=PassSummaryOut(
                rows=[pass_out(p, people) for p in data.passes],
                missing=[
                    MissingPassOut(
                        person=person_out(m.person_id, people),
                        resort_id=UUID(m.resort_id) if m.resort_id else None,
                    )
                    for m in data.missing
                ],
            ),
            gear=GearRollupOut(
                rows=[gear_out(g, people) for g in data.gear],
                rent_counts=data.rollup.rent_counts,
                sizes=sizes,
                sizes_hidden=data.rollup.sizes_hidden,
            ),
            levels=[
                LevelGroupOut(
                    discipline=g.discipline,
                    level=g.level,
                    people=[person_out(pid, people) for pid in g.person_ids],
                )
                for g in data.levels
            ],
        ),
    )


@router.get(
    "/trips/{trip_id}/ski/conditions",
    response={HTTPStatus.OK: SkiConditionsOut, **ERRORS},
    auth=django_auth,
    summary="Get Ski Conditions",
)
def get_conditions(request, trip_id: UUID):
    """Cheap read of the latest report per resort (used by Today)."""
    ski_access(request, trip_id)
    items = trip_conditions(str(trip_id), now(), store())
    return Status(
        HTTPStatus.OK,
        SkiConditionsOut(
            resorts=[
                ConditionsResortOut(
                    resort_id=UUID(c.trip_resort.resort.id),
                    name=c.trip_resort.resort.name,
                    latest_report=report_out(c.latest) if c.latest else None,
                )
                for c in items
            ]
        ),
    )


@router.get(
    "/trips/{trip_id}/ski/resorts/{resort_id}/reports",
    response={HTTPStatus.OK: list[SnowReportOut], **ERRORS},
    auth=django_auth,
    summary="List Snow Reports",
)
def list_reports(request, trip_id: UUID, resort_id: UUID):
    ski_access(request, trip_id)
    try:
        views = reports.recent_reports(str(trip_id), str(resort_id), now(), store())
    except trip_resorts.ResortNotOnTripError as exc:
        raise not_found() from exc
    return Status(HTTPStatus.OK, [report_out(v) for v in views])


@router.post(
    "/trips/{trip_id}/ski/resorts/{resort_id}/reports",
    response={HTTPStatus.CREATED: SnowReportOut, HTTPStatus.TOO_MANY_REQUESTS: ErrorOut, **ERRORS},
    auth=django_auth,
    summary="Post Manual Snow Report",
)
def post_report(request, trip_id: UUID, resort_id: UUID, payload: ManualReportIn):
    """At least one field. 400 `invalid_request`; 429 `rate_limited` (6 per resort per hour)."""
    access = ski_access(request, trip_id)
    try:
        view = manual_report.add_manual_report(
            str(trip_id),
            str(resort_id),
            str(access.membership.person_id),
            domain.ManualReportInput(**payload.model_dump()),
            now(),
            store(),
            per_hour=conf.manual_reports_per_hour(),
        )
    except trip_resorts.ResortNotOnTripError as exc:
        raise not_found() from exc
    except domain.InvalidSkiInputError as exc:
        raise invalid(str(exc)) from exc
    except manual_report.RateLimitedError as exc:
        raise ApiError(
            429,
            "rate_limited",
            "Too many reports for this resort",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    return Status(HTTPStatus.CREATED, report_out(view))


# --- passes and gear -----------------------------------------------------------------------


def pass_out(row: domain.PassRecord, people: dict[str, str]) -> PassRowOut:
    return PassRowOut(
        person=person_out(row.person_id, people),
        resort_id=UUID(row.resort_id) if row.resort_id else None,
        product=row.product,
        days=row.days,
        status=row.status,
        price=money(row.price),
        currency=row.currency,
    )


def gear_out(row: domain.GearRecord, people: dict[str, str]) -> GearRowOut:
    return GearRowOut(
        person=person_out(row.person_id, people),
        item=row.item,
        mode=row.mode,
        price=money(row.price),
        currency=row.currency,
        note=row.note,
    )


def _my_name(access: TripAccess) -> dict[str, str]:
    person = access.membership.person
    return {str(person.pk): person.display_name or person.phone}


@router.put(
    "/trips/{trip_id}/ski/passes/me",
    response={HTTPStatus.OK: PassRowOut, **ERRORS},
    auth=django_auth,
    summary="Set My Lift Pass",
)
def put_my_pass(request, trip_id: UUID, payload: PassIn):
    """Upsert on (trip, me, resort); `resort_id` null means "any / not decided"."""
    access = ski_access(request, trip_id)
    item = domain.PassInput(
        resort_id=str(payload.resort_id) if payload.resort_id else None,
        status=payload.status,
        product=payload.product,
        days=payload.days,
        price=payload.price,
        currency=payload.currency,
    )
    try:
        row = passes.set_my_pass(
            str(trip_id), str(access.membership.person_id), item, access.trip.currency, store()
        )
    except (domain.InvalidSkiInputError, domain.ResortNotFoundError) as exc:
        raise invalid(str(exc)) from exc
    return Status(HTTPStatus.OK, pass_out(row, _my_name(access)))


@router.delete(
    "/trips/{trip_id}/ski/passes/me",
    response={HTTPStatus.NO_CONTENT: None, **ERRORS},
    auth=django_auth,
    summary="Delete My Lift Pass",
)
def delete_my_pass(request, trip_id: UUID, resort_id: UUID | None = None):
    access = ski_access(request, trip_id)
    passes.delete_my_pass(
        str(trip_id),
        str(access.membership.person_id),
        str(resort_id) if resort_id else None,
        store(),
    )
    return Status(HTTPStatus.NO_CONTENT, None)


@router.put(
    "/trips/{trip_id}/ski/gear/me",
    response={HTTPStatus.OK: list[GearRowOut], **ERRORS},
    auth=django_auth,
    summary="Set My Gear Plan",
)
def put_my_gear(request, trip_id: UUID, payload: GearIn):
    """Replaces all of my rows for the trip."""
    access = ski_access(request, trip_id)
    items = [domain.GearInput(**i.model_dump()) for i in payload.items]
    try:
        rows = gear_use_cases.set_my_gear(
            str(trip_id), str(access.membership.person_id), items, access.trip.currency, store()
        )
    except domain.InvalidSkiInputError as exc:
        raise invalid(str(exc)) from exc
    names = _my_name(access)
    return Status(HTTPStatus.OK, [gear_out(r, names) for r in rows])


# --- profile -------------------------------------------------------------------------------


def profile_out(record: domain.ProfileRecord) -> SkiProfileOut:
    return SkiProfileOut(
        discipline=record.discipline,
        level=record.level,
        owns_gear=record.owns_gear,
        boot_size_eu=_float(record.boot_size_eu),
        height_cm=record.height_cm,
        weight_kg=record.weight_kg,
        share_sizes_with_trip=record.share_sizes_with_trip,
    )


@router.get(
    "/me/ski_profile",
    response={HTTPStatus.OK: SkiProfileOut, HTTPStatus.UNAUTHORIZED: ErrorOut},
    auth=django_auth,
    summary="Get My Ski Profile",
)
def get_my_profile(request):
    """Only the owner reads their profile (it holds sizes and weight)."""
    person = current_person(request)
    return Status(HTTPStatus.OK, profile_out(profile.get_my_profile(str(person.pk), store())))


@router.put(
    "/me/ski_profile",
    response={HTTPStatus.OK: SkiProfileOut, **ERRORS},
    auth=django_auth,
    summary="Save My Ski Profile",
)
def put_my_profile(request, payload: SkiProfileIn):
    person = current_person(request)
    try:
        saved = profile.save_my_profile(
            str(person.pk), domain.ProfileInput(**payload.model_dump()), store()
        )
    except domain.InvalidSkiInputError as exc:
        raise invalid(str(exc)) from exc
    return Status(HTTPStatus.OK, profile_out(saved))
