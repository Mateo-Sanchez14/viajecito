from http import HTTPStatus
from uuid import UUID

from django.http import HttpResponse
from ninja import File, Router, Status
from ninja.files import UploadedFile
from ninja.security import django_auth

from crews.api_auth import current_person, member_of_crew
from shared.api_errors import ApiError, ErrorOut
from shared.images import MAX_IMAGE_BYTES
from shared.timezones import InvalidTimezoneError
from trips.adapters.cover_image import process_cover
from trips.adapters.django_store import DjangoTripStore
from trips.api_auth import member_of_trip
from trips.domain import InvalidCoverError, InvalidTripInputError, TripData, TripDetail
from trips.schemas import (
    MemberPreviewOut,
    ParticipantIn,
    ParticipantOut,
    TripCreateIn,
    TripOut,
    TripPatchIn,
    TripSummaryOut,
)
from trips.use_cases.clear_trip_cover import clear_trip_cover
from trips.use_cases.create_trip import create_trip as create_trip_use_case
from trips.use_cases.get_trip import get_trip as get_trip_use_case
from trips.use_cases.list_trips import list_trips as list_trips_use_case
from trips.use_cases.read_trip_cover import read_trip_cover
from trips.use_cases.set_participation import set_participation as set_participation_use_case
from trips.use_cases.set_trip_cover import set_trip_cover
from trips.use_cases.update_trip import update_trip as update_trip_use_case

router = Router(tags=["trips"])

COVER_CACHE_CONTROL = "private, max-age=604800"  # safe: the web URL carries ?v=<cover_version>
COVER_FAILURES = {
    "too_large": (HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "file_too_large"),
    "too_many_pixels": (HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "image_too_large"),
    "invalid_image": (HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "unsupported_image"),
}


def store() -> DjangoTripStore:
    return DjangoTripStore()


def invalid(exc: InvalidTripInputError | InvalidTimezoneError) -> ApiError:
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
    listing = list_trips_use_case(str(crew_id), store())
    members_preview = [MemberPreviewOut(**vars(m)) for m in listing.members_preview]
    return Status(
        HTTPStatus.OK,
        [
            TripSummaryOut(
                **{k: v for k, v in vars(t).items() if k in TripSummaryOut.model_fields},
                member_count=listing.member_count,
                members_preview=members_preview,
            )
            for t in listing.trips
        ],
    )


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
    except (InvalidTripInputError, InvalidTimezoneError) as exc:
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
        trip = update_trip_use_case(
            str(trip_id), str(access.membership.person_id), **payload.model_dump(exclude_unset=True)
        )
    except (InvalidTripInputError, InvalidTimezoneError) as exc:
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
    except (InvalidTripInputError, InvalidTimezoneError) as exc:
        raise invalid(exc) from exc
    return Status(HTTPStatus.OK, ParticipantOut(**vars(row)))


@router.post(
    "/trips/{trip_id}/cover",
    response={
        HTTPStatus.OK: TripOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.REQUEST_ENTITY_TOO_LARGE: ErrorOut,
        HTTPStatus.UNSUPPORTED_MEDIA_TYPE: ErrorOut,
    },
    auth=django_auth,
    summary="Set Trip Cover",
)
def set_cover(request, trip_id: UUID, file: File[UploadedFile | None] = None):
    """Multipart `file` (JPEG, PNG, WEBP or GIF, at most 5 MiB and 25 megapixels); re-encoded to
    WebP without metadata and stored privately, replacing any previous cover. Any active member of
    the crew may set it. 400: `file_required`. 413: `file_too_large`, `image_too_large`.
    415: `unsupported_image` (also SVG, HEIC, truncated or undecodable files)."""
    access = member_of_trip(request, trip_id)
    if file is None:
        raise ApiError(HTTPStatus.BAD_REQUEST, "file_required", "A file is required")
    if file.size is not None and file.size > MAX_IMAGE_BYTES:  # checked before reading the body
        status, code = COVER_FAILURES["too_large"]
        raise ApiError(status, code, "The file is too large")
    try:
        trip = set_trip_cover(str(trip_id), file.read(), store(), process_cover)
    except InvalidCoverError as exc:
        status, code = COVER_FAILURES[exc.code]
        raise ApiError(status, code, "The image cannot be used as a cover") from exc
    return Status(HTTPStatus.OK, trip_out(detail_of(trip, str(access.membership.person_id))))


@router.get(
    "/trips/{trip_id}/cover",
    response={HTTPStatus.UNAUTHORIZED: ErrorOut, HTTPStatus.NOT_FOUND: ErrorOut},
    auth=django_auth,
    summary="Get Trip Cover",
    openapi_extra={
        "responses": {
            "200": {
                "description": "The cover (WebP, at most 1280 px on its longest side)",
                "content": {"image/webp": {"schema": {"type": "string", "format": "binary"}}},
            }
        }
    },
)
def get_cover(request, trip_id: UUID):
    """`200 image/webp` (private, one week; the web adds `?v=<cover_version>`, which is ignored).
    404 without a cover or without access."""
    member_of_trip(request, trip_id)
    data = read_trip_cover(str(trip_id), store())
    if data is None:
        raise ApiError(HTTPStatus.NOT_FOUND, "not_found", "Not found")
    response = HttpResponse(data, content_type="image/webp")
    response["Cache-Control"] = COVER_CACHE_CONTROL
    response["X-Content-Type-Options"] = "nosniff"
    response["Cross-Origin-Resource-Policy"] = "same-origin"
    return response


@router.delete(
    "/trips/{trip_id}/cover",
    response={
        HTTPStatus.OK: TripOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="Clear Trip Cover",
)
def clear_cover(request, trip_id: UUID):
    """Removes the cover; idempotent (a trip without one answers 200 unchanged)."""
    access = member_of_trip(request, trip_id)
    trip = clear_trip_cover(str(trip_id), store())
    return Status(HTTPStatus.OK, trip_out(detail_of(trip, str(access.membership.person_id))))
