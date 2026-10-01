from http import HTTPStatus
from uuid import UUID

from ninja import Router, Status
from ninja.security import django_auth

from crews.api_auth import current_person, member_of_crew
from shared.api_errors import ApiError, ErrorOut
from trips.adapters.django_store import DjangoTripStore
from trips.api_auth import member_of_trip
from trips.domain import InvalidTripInputError, TripData, TripDetail
from trips.schemas import (
    ParticipantIn,
    ParticipantOut,
    TripCreateIn,
    TripOut,
    TripPatchIn,
    TripSummaryOut,
)
from trips.use_cases.create_trip import create_trip as create_trip_use_case
from trips.use_cases.get_trip import get_trip as get_trip_use_case
from trips.use_cases.list_trips import list_trips as list_trips_use_case
from trips.use_cases.set_participation import set_participation as set_participation_use_case
from trips.use_cases.update_trip import update_trip as update_trip_use_case

router = Router(tags=["trips"])


def store() -> DjangoTripStore:
    return DjangoTripStore()


def invalid(exc: InvalidTripInputError) -> ApiError:
    return ApiError(HTTPStatus.BAD_REQUEST, "invalid_request", str(exc))


def trip_out(detail: TripDetail) -> TripOut:
    return TripOut(
        **vars(detail.trip),
        modules=detail.modules,
        participants=[ParticipantOut(**vars(p)) for p in detail.participants],
        my_rsvp=detail.my_rsvp,
    )


def detail_of(trip: TripData, person_id: str) -> TripDetail:
    return get_trip_use_case(trip.id, person_id, store())


@router.get(
    "/crews/{crew_id}/trips",
    response={
        HTTPStatus.OK: list[TripSummaryOut],
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="List Trips",
)
def list_trips(request, crew_id: UUID):
    member_of_crew(request, crew_id)
    trips = list_trips_use_case(str(crew_id), store())
    return Status(HTTPStatus.OK, [TripSummaryOut(**vars(t)) for t in trips])


@router.post(
    "/crews/{crew_id}/trips",
    response={
        HTTPStatus.CREATED: TripOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="Create Trip",
)
def create_trip(request, crew_id: UUID, payload: TripCreateIn):
    """400 codes: `invalid_request`. 404: `not_found` (not a member of the crew)."""
    membership = member_of_crew(request, crew_id)
    person_id = str(membership.person_id)
    try:
        trip = create_trip_use_case(str(crew_id), person_id, store(), **payload.model_dump())
    except InvalidTripInputError as exc:
        raise invalid(exc) from exc
    return Status(HTTPStatus.CREATED, trip_out(detail_of(trip, person_id)))


@router.get(
    "/trips/{trip_id}",
    response={
        HTTPStatus.OK: TripOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="Get Trip",
)
def get_trip(request, trip_id: UUID):
    access = member_of_trip(request, trip_id)
    detail = get_trip_use_case(str(trip_id), str(access.membership.person_id), store())
    return Status(HTTPStatus.OK, trip_out(detail))


@router.patch(
    "/trips/{trip_id}",
    response={
        HTTPStatus.OK: TripOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="Update Trip",
)
def update_trip(request, trip_id: UUID, payload: TripPatchIn):
    """Any active member of the crew may update. 400 codes: `invalid_request`."""
    access = member_of_trip(request, trip_id)
    try:
        trip = update_trip_use_case(str(trip_id), payload.model_dump(exclude_unset=True), store())
    except InvalidTripInputError as exc:
        raise invalid(exc) from exc
    return Status(HTTPStatus.OK, trip_out(detail_of(trip, str(access.membership.person_id))))


@router.put(
    "/trips/{trip_id}/participation",
    response={
        HTTPStatus.OK: ParticipantOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="Set Participation",
)
def set_participation(request, trip_id: UUID, payload: ParticipantIn):
    """Sets the caller's own RSVP, creating their participation when missing."""
    member_of_trip(request, trip_id)
    person = current_person(request)
    try:
        row = set_participation_use_case(str(trip_id), str(person.pk), payload.rsvp, store())
    except InvalidTripInputError as exc:
        raise invalid(exc) from exc
    return Status(HTTPStatus.OK, ParticipantOut(**vars(row)))
