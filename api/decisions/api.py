from http import HTTPStatus
from uuid import UUID

from ninja import Query, Router, Status
from ninja.security import django_auth

from decisions.adapters.django_store import DjangoDecisionStore
from decisions.adapters.trips_gateway import CoreTripGateway
from decisions.domain.rules import DecisionError
from decisions.schemas import (
    AvailabilityIn,
    AvailabilityOut,
    DecisionCloseIn,
    DecisionCreateIn,
    DecisionOut,
    DecisionPatchIn,
    GridPersonOut,
    PersonRefOut,
    WindowOut,
)
from decisions.use_cases.board import DecisionView
from decisions.use_cases.close_decision import close_decision as close_decision_use_case
from decisions.use_cases.get_availability import AvailabilityView
from decisions.use_cases.get_availability import get_availability as get_availability_use_case
from decisions.use_cases.list_decisions import get_decision as get_decision_use_case
from decisions.use_cases.list_decisions import list_decisions as list_decisions_use_case
from decisions.use_cases.open_decision import open_decision as open_decision_use_case
from decisions.use_cases.reopen_decision import reopen_decision as reopen_decision_use_case
from decisions.use_cases.set_availability import set_availability as set_availability_use_case
from decisions.use_cases.update_decision import update_decision as update_decision_use_case
from shared.api_errors import ApiError, ErrorOut
from trips.api_auth import member_of_trip

router = Router(tags=["decisions"])

STATUS_BY_CODE = {
    "not_found": HTTPStatus.NOT_FOUND,
    "decision_already_open": HTTPStatus.CONFLICT,
    "decision_closed": HTTPStatus.CONFLICT,
    "decision_open": HTTPStatus.CONFLICT,
}


def failure(exc: DecisionError) -> ApiError:
    return ApiError(STATUS_BY_CODE.get(exc.code, HTTPStatus.BAD_REQUEST), exc.code, str(exc))


def deps() -> tuple[DjangoDecisionStore, CoreTripGateway]:
    return DjangoDecisionStore(), CoreTripGateway()


def authorize(request, decision_id: UUID):
    """The decision's trip access; an unknown id and a foreign trip look exactly the same."""
    decision = DjangoDecisionStore().get(str(decision_id))
    if decision is None:
        raise ApiError(HTTPStatus.NOT_FOUND, "not_found", "Not found")
    return member_of_trip(request, decision.trip_id)


def person_ref(ref) -> PersonRefOut | None:
    return (
        None
        if ref is None
        else PersonRefOut(person_id=ref.person_id, display_name=ref.display_name)
    )


def decision_out(view: DecisionView) -> DecisionOut:
    d = view.decision
    return DecisionOut(
        id=d.id,
        trip_id=d.trip_id,
        kind=d.kind,
        status=d.status,
        window_start=d.window_start,
        window_end=d.window_end,
        min_days=d.min_days,
        max_days=d.max_days,
        maybe_weight=f"{d.maybe_weight:.2f}",
        deadline=d.deadline,
        outcome_start=d.outcome_start,
        outcome_end=d.outcome_end,
        opened_by=person_ref(view.opened_by),
        closed_by=person_ref(view.closed_by),
        closed_at=d.closed_at,
        respondents=view.respondents,
        eligible=view.eligible,
    )


def availability_out(view: AvailabilityView) -> AvailabilityOut:
    return AvailabilityOut(
        decision=decision_out(view.decision),
        dates=view.dates,
        people=[
            GridPersonOut(
                person_id=p.person_id,
                display_name=p.display_name,
                rsvp=p.rsvp,
                answers={day.isoformat(): answer for day, answer in sorted(p.answers.items())},
            )
            for p in view.people
        ],
        me=view.me,
        best_windows=[
            WindowOut(
                start=w.start,
                end=w.end,
                days=w.days,
                avg_score=float(w.avg_score),
                no_count=w.no_count,
                blocked_people=list(w.blocked_people),
                full_people=list(w.full_people),
                weekend_days=w.weekend_days,
                missing_people=list(w.missing_people),
            )
            for w in view.best_windows
        ],
        has_data=view.has_data,
        non_responders=[person_ref(p) for p in view.non_responders],
    )


COMMON = {
    HTTPStatus.UNAUTHORIZED: ErrorOut,
    HTTPStatus.FORBIDDEN: ErrorOut,
    HTTPStatus.NOT_FOUND: ErrorOut,
}


@router.get(
    "/trips/{trip_id}/decisions",
    response={HTTPStatus.OK: list[DecisionOut], HTTPStatus.BAD_REQUEST: ErrorOut, **COMMON},
    auth=django_auth,
    summary="List Decisions",
)
def list_decisions(request, trip_id: UUID, status: Query[str | None] = None):
    """Newest first. 400 codes: `invalid_request` (unknown `status`)."""
    member_of_trip(request, trip_id)
    store, trips = deps()
    try:
        views = list_decisions_use_case(str(trip_id), store, trips, status)
    except DecisionError as exc:
        raise failure(exc) from exc
    return Status(HTTPStatus.OK, [decision_out(v) for v in views])


@router.post(
    "/trips/{trip_id}/decisions",
    response={
        HTTPStatus.CREATED: DecisionOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.CONFLICT: ErrorOut,
        **COMMON,
    },
    auth=django_auth,
    summary="Open Decision",
)
def open_decision(request, trip_id: UUID, payload: DecisionCreateIn):
    """Any member may open a dates decision. 400 codes: `invalid_request`, `invalid_window`.
    409: `decision_already_open`."""
    access = member_of_trip(request, trip_id)
    store, trips = deps()
    try:
        decision = open_decision_use_case(
            str(trip_id),
            str(access.membership.person_id),
            store,
            **payload.model_dump(exclude={"kind"}),
        )
    except DecisionError as exc:
        raise failure(exc) from exc
    return Status(
        HTTPStatus.CREATED, decision_out(get_decision_use_case(decision.id, store, trips))
    )


@router.get(
    "/decisions/{decision_id}",
    response={HTTPStatus.OK: DecisionOut, **COMMON},
    auth=django_auth,
    summary="Get Decision",
)
def get_decision(request, decision_id: UUID):
    authorize(request, decision_id)
    store, trips = deps()
    return Status(
        HTTPStatus.OK, decision_out(get_decision_use_case(str(decision_id), store, trips))
    )


@router.patch(
    "/decisions/{decision_id}",
    response={
        HTTPStatus.OK: DecisionOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.CONFLICT: ErrorOut,
        **COMMON,
    },
    auth=django_auth,
    summary="Update Decision",
)
def update_decision(request, decision_id: UUID, payload: DecisionPatchIn):
    """400 codes: `invalid_request`, `invalid_window`. 409: `decision_closed`."""
    authorize(request, decision_id)
    store, trips = deps()
    try:
        update_decision_use_case(str(decision_id), store, **payload.model_dump(exclude_unset=True))
    except DecisionError as exc:
        raise failure(exc) from exc
    return Status(
        HTTPStatus.OK, decision_out(get_decision_use_case(str(decision_id), store, trips))
    )


@router.get(
    "/decisions/{decision_id}/availability",
    response={HTTPStatus.OK: AvailabilityOut, **COMMON},
    auth=django_auth,
    summary="Get Availability",
)
def get_availability(request, decision_id: UUID):
    access = authorize(request, decision_id)
    store, trips = deps()
    view = get_availability_use_case(
        str(decision_id), str(access.membership.person_id), store, trips
    )
    return Status(HTTPStatus.OK, availability_out(view))


@router.put(
    "/decisions/{decision_id}/availability",
    response={
        HTTPStatus.OK: AvailabilityOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.CONFLICT: ErrorOut,
        **COMMON,
    },
    auth=django_auth,
    summary="Set Availability",
)
def set_availability(request, decision_id: UUID, payload: AvailabilityIn):
    """Writes the CALLER's answers only (`null` clears a day). 400 codes: `date_out_of_range`,
    `invalid_request`. 409: `decision_closed`."""
    access = authorize(request, decision_id)
    person_id = str(access.membership.person_id)
    store, trips = deps()
    try:
        set_availability_use_case(
            str(decision_id), person_id, store, [(a.date, a.answer) for a in payload.answers]
        )
    except DecisionError as exc:
        raise failure(exc) from exc
    return Status(
        HTTPStatus.OK,
        availability_out(get_availability_use_case(str(decision_id), person_id, store, trips)),
    )


@router.post(
    "/decisions/{decision_id}/close",
    response={
        HTTPStatus.OK: DecisionOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.CONFLICT: ErrorOut,
        **COMMON,
    },
    auth=django_auth,
    summary="Close Decision",
)
def close_decision(request, decision_id: UUID, payload: DecisionCloseIn):
    """Writes the chosen dates (default: best window #1) to the trip. 400 codes: `invalid_window`,
    `no_window`. 409: `decision_closed`."""
    access = authorize(request, decision_id)
    store, trips = deps()
    try:
        close_decision_use_case(
            str(decision_id),
            str(access.membership.person_id),
            store,
            trips,
            start_on=payload.start_on,
            end_on=payload.end_on,
        )
    except DecisionError as exc:
        raise failure(exc) from exc
    return Status(
        HTTPStatus.OK, decision_out(get_decision_use_case(str(decision_id), store, trips))
    )


@router.post(
    "/decisions/{decision_id}/reopen",
    response={HTTPStatus.OK: DecisionOut, HTTPStatus.CONFLICT: ErrorOut, **COMMON},
    auth=django_auth,
    summary="Reopen Decision",
)
def reopen_decision(request, decision_id: UUID):
    """Trip dates stay untouched. 409: `decision_open`, `decision_already_open`."""
    authorize(request, decision_id)
    store, trips = deps()
    try:
        reopen_decision_use_case(str(decision_id), store)
    except DecisionError as exc:
        raise failure(exc) from exc
    return Status(
        HTTPStatus.OK, decision_out(get_decision_use_case(str(decision_id), store, trips))
    )
