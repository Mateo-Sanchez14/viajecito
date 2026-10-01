from collections.abc import Iterable
from http import HTTPStatus
from urllib.parse import urlsplit
from uuid import UUID

from django.db import transaction
from django.http import HttpResponse
from ninja import Field, Query, Router, Schema, Status
from ninja.security import django_auth

from crews.api_auth import current_person
from identity.use_cases.display_names import display_names
from linkpreview.domain.urls import (
    host_of,
    is_ignored_host,
    is_maps_short_link,
    normalize,
    strip_tracking,
)
from proposals import conf
from proposals.adapters import previews, wiring
from proposals.adapters.django_store import DjangoProposalStore
from proposals.domain.rules import InvalidProposalError
from proposals.domain.status import InvalidTransitionError
from proposals.domain.types import PreviewSummary, ProposalRecord
from proposals.ports import DuplicateProposalError
from proposals.schemas import (
    CommentIn,
    CommentOut,
    DuplicateProposalOut,
    LinkPreviewOut,
    PersonRefOut,
    ProposalCreateIn,
    ProposalOut,
    ProposalPatchIn,
    ProposalsSummaryOut,
    ProposalSummaryOut,
    QueuedOut,
    TransitionIn,
    VoteIn,
    VoteTallyOut,
)
from proposals.use_cases.add_comment import add_comment
from proposals.use_cases.cast_vote import ProposalClosedError, cast_vote, remove_vote
from proposals.use_cases.create_proposal import create_proposal
from proposals.use_cases.list_proposals import (
    ProposalView,
    get_proposal,
    list_proposals,
    proposals_summary,
)
from proposals.use_cases.transition_proposal import transition_proposal
from proposals.use_cases.update_proposal import update_proposal
from shared.api_errors import ApiError, ErrorOut
from trips.api_auth import TripAccess, member_of_trip

router = Router(tags=["proposals"])
PREFIX = ""

MAX_URL_CHARS = 2000


def store() -> DjangoProposalStore:
    return DjangoProposalStore()


def not_found() -> ApiError:
    return ApiError(HTTPStatus.NOT_FOUND, "not_found", "Not found")


def invalid(exc: InvalidProposalError) -> ApiError:
    return ApiError(HTTPStatus.BAD_REQUEST, exc.code, str(exc))


def viewer_id(request) -> str:
    return str(current_person(request).pk)


def authorize(request, proposal_id: UUID) -> tuple[ProposalRecord, TripAccess]:
    """The proposal and the caller's access to its trip; unknown ids and outsiders both get 404."""
    current_person(request)
    record = store().get(str(proposal_id))
    if record is None:
        raise not_found()
    return record, member_of_trip(request, record.trip_id)


# --- output mapping ---------------------------------------------------------------------------


def person_refs(ids: Iterable[str]) -> dict[str, PersonRefOut]:
    wanted = sorted(set(ids))
    names = display_names(wanted)
    return {i: PersonRefOut(person_id=UUID(i), display_name=names.get(i, "")) for i in wanted}


def preview_out(preview: PreviewSummary | None) -> LinkPreviewOut | None:
    if preview is None:
        return None
    return LinkPreviewOut(
        url=preview.url,
        final_url=preview.final_url,
        site_name=preview.site_name,
        title=preview.title,
        description=preview.description,
        image_url=preview.image_url,
        has_thumbnail=preview.has_thumbnail,
        price_amount=None if preview.price_amount is None else str(preview.price_amount),
        price_currency=preview.price_currency,
        lat=preview.lat,
        lng=preview.lng,
        fetch_status=preview.fetch_status,
        fetched_at=preview.fetched_at,
    )


def tally_out(view: ProposalView) -> VoteTallyOut:
    tally = view.tally
    return VoteTallyOut(
        up=tally.up,
        neutral=tally.neutral,
        down=tally.down,
        score=tally.score,
        my_vote=tally.my_vote,
        majority=tally.majority,
    )


def summary_fields(view: ProposalView, people: dict[str, PersonRefOut]) -> dict:
    record = view.record
    return {
        "id": UUID(record.id),
        "trip_id": UUID(record.trip_id),
        "category": record.category,
        "status": record.status,
        "title": record.title,
        "note": record.note,
        "author": people[record.author_id],
        "est_price": None if record.est_price is None else str(record.est_price),
        "currency": record.currency,
        "price_basis": record.price_basis,
        "starts_on": record.starts_on,
        "ends_on": record.ends_on,
        "booking_ref": record.booking_ref,
        "preview": preview_out(record.preview),
        "tally": tally_out(view),
        "comment_count": record.comment_count,
        "allowed_transitions": view.allowed_transitions,
        "web_path": record.web_path,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def summaries_out(views: list[ProposalView]) -> list[ProposalSummaryOut]:
    people = person_refs(v.record.author_id for v in views)
    return [ProposalSummaryOut(**summary_fields(view, people)) for view in views]


def proposal_out(view: ProposalView) -> ProposalOut:
    record = view.record
    votes = store().votes_for([record.id])[record.id]
    people = person_refs([record.author_id, *(person_id for person_id, _ in votes)])
    return ProposalOut(
        **summary_fields(view, people),
        votes=[{"person": people[person_id], "value": value} for person_id, value in votes],
        chosen_at=record.chosen_at,
        booked_at=record.booked_at,
        discarded_at=record.discarded_at,
        source="whatsapp" if record.source_message_id is not None else "web",
    )


def detail(request, proposal_id: str) -> ProposalOut:
    return proposal_out(get_proposal(store(), proposal_id, viewer_id(request)))


def comment_out(comment, people: dict[str, PersonRefOut], me: str) -> CommentOut:
    return CommentOut(
        id=UUID(comment.id),
        proposal_id=UUID(comment.proposal_id),
        author=people[comment.author_id],
        body=comment.body,
        source="whatsapp" if comment.source_message_id is not None else "web",
        created_at=comment.created_at,
        can_delete=comment.author_id == me,
    )


# --- URL input --------------------------------------------------------------------------------


def clean_url(raw: str, access: TripAccess) -> str:
    """The tracking-free http(s) URL a person typed, or ``invalid_url`` / ``ignored_url``."""
    text = raw.strip()
    if text.lower().startswith("www."):
        text = f"https://{text}"
    if len(text) > MAX_URL_CHARS:
        raise ApiError(HTTPStatus.BAD_REQUEST, "invalid_url", "URL is too long")
    try:
        parts = urlsplit(text)
        host = host_of(text)
    except ValueError as exc:
        raise ApiError(HTTPStatus.BAD_REQUEST, "invalid_url", "Not a valid URL") from exc
    if (
        parts.scheme.lower() not in ("http", "https")
        or "." not in host
        or any(ch.isspace() for ch in text)
    ):
        raise ApiError(HTTPStatus.BAD_REQUEST, "invalid_url", "Not a valid http(s) URL")
    own = [host_of(conf.public_origin())]
    gastito = access.membership.crew.gastito_group_url
    if gastito:
        own.append(host_of(gastito))
    if is_ignored_host(host, own):
        raise ApiError(HTTPStatus.BAD_REQUEST, "ignored_url", "This link is not a proposal source")
    return strip_tracking(text)


# --- endpoints --------------------------------------------------------------------------------


class ListFilters(Schema):
    category: list[str] = Field(default_factory=list)
    status: list[str] = Field(default_factory=list)
    include_discarded: bool = False
    sort: str = "recent"


@router.get(
    "/trips/{trip_id}/proposals",
    response={
        HTTPStatus.OK: list[ProposalSummaryOut],
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="List Proposals",
)
def list_trip_proposals(request, trip_id: UUID, filters: Query[ListFilters]):
    """Defaults: every status but `discarded`, newest first (max 500). 400: `invalid_request`."""
    access = member_of_trip(request, trip_id)
    try:
        views = list_proposals(
            store(),
            str(trip_id),
            str(access.membership.person_id),
            categories=filters.category,
            statuses=filters.status,
            include_discarded=filters.include_discarded,
            sort=filters.sort,
        )
    except InvalidProposalError as exc:
        raise invalid(exc) from exc
    return Status(HTTPStatus.OK, summaries_out(views))


@router.get(
    "/trips/{trip_id}/proposals/summary",
    response={
        HTTPStatus.OK: ProposalsSummaryOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="Proposals Summary",
)
def trip_proposals_summary(request, trip_id: UUID):
    access = member_of_trip(request, trip_id)
    summary = proposals_summary(store(), str(trip_id), str(access.membership.person_id))
    return Status(
        HTTPStatus.OK, ProposalsSummaryOut(counts=summary.counts, top=summaries_out(summary.top))
    )


@router.post(
    "/trips/{trip_id}/proposals",
    response={
        HTTPStatus.CREATED: ProposalOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.CONFLICT: DuplicateProposalOut,
    },
    auth=django_auth,
    summary="Create Proposal",
)
def create_trip_proposal(request, trip_id: UUID, payload: ProposalCreateIn):
    """`url` or `title` is required. 400: `invalid_request`, `invalid_url`, `ignored_url`,
    `invalid_dates`. 409: `duplicate_proposal` (+ `proposal_id`). The link preview is
    `pending` in the response; it is unfurled off the request."""
    access = member_of_trip(request, trip_id)
    person_id = str(access.membership.person_id)
    repo = store()
    url = canonical = preview = None
    needs_fetch = False
    if payload.url and payload.url.strip():
        url = clean_url(payload.url, access)
        if not is_maps_short_link(url):
            existing = repo.find_by_canonical(str(trip_id), normalize(url))
            if existing is not None:
                return duplicate(existing.id)
        preview, needs_fetch = previews.prepare(url)
        canonical = preview.canonical_url
        existing = repo.find_by_canonical(str(trip_id), canonical)
        if existing is not None:
            return duplicate(existing.id)
    try:
        with transaction.atomic():
            record = create_proposal(
                repo,
                trip_id=str(trip_id),
                author_id=person_id,
                classifier=wiring.rules_classifier(),
                llm=wiring.llm_classifier(),
                url=url,
                canonical_url=canonical,
                preview=preview,
                title=payload.title,
                category=payload.category,
                note=payload.note or "",
                est_price=payload.est_price,
                currency=payload.currency,
                price_basis=payload.price_basis or "total",
                starts_on=payload.starts_on,
                ends_on=payload.ends_on,
            )
            body = detail(request, record.id)
            if needs_fetch and preview is not None:
                previews.schedule(preview.id)
    except DuplicateProposalError as exc:
        return duplicate(exc.proposal_id)
    except InvalidProposalError as exc:
        raise invalid(exc) from exc
    return Status(HTTPStatus.CREATED, body)


def duplicate(proposal_id: str):
    return Status(
        HTTPStatus.CONFLICT,
        DuplicateProposalOut(
            code="duplicate_proposal",
            message="This link is already a proposal of the trip",
            proposal_id=UUID(proposal_id),
        ),
    )


@router.get(
    "/proposals/{proposal_id}",
    response={
        HTTPStatus.OK: ProposalOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="Get Proposal",
)
def get_trip_proposal(request, proposal_id: UUID):
    record, _ = authorize(request, proposal_id)
    return Status(HTTPStatus.OK, detail(request, record.id))


@router.patch(
    "/proposals/{proposal_id}",
    response={
        HTTPStatus.OK: ProposalOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="Update Proposal",
)
def patch_trip_proposal(request, proposal_id: UUID, payload: ProposalPatchIn):
    """Partial edit; `est_price`, the dates and `booking_ref` accept `null` to clear them.
    Editing `category` marks it as the user's choice. 400: `invalid_request`, `invalid_dates`."""
    record, _ = authorize(request, proposal_id)
    try:
        update_proposal(store(), record.id, payload.model_dump(exclude_unset=True))
    except InvalidProposalError as exc:
        raise invalid(exc) from exc
    return Status(HTTPStatus.OK, detail(request, record.id))


@router.post(
    "/proposals/{proposal_id}/transition",
    response={
        HTTPStatus.OK: ProposalOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.CONFLICT: ErrorOut,
    },
    auth=django_auth,
    summary="Transition Proposal",
)
def transition_trip_proposal(request, proposal_id: UUID, payload: TransitionIn):
    """The same status is a no-op. 409: `invalid_transition`."""
    record, access = authorize(request, proposal_id)
    try:
        transition_proposal(
            store(),
            record.id,
            payload.to,
            str(access.membership.person_id),
            booking_ref=payload.booking_ref,
        )
    except InvalidTransitionError as exc:
        raise ApiError(HTTPStatus.CONFLICT, "invalid_transition", str(exc)) from exc
    return Status(HTTPStatus.OK, detail(request, record.id))


@router.put(
    "/proposals/{proposal_id}/vote",
    response={
        HTTPStatus.OK: VoteTallyOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.CONFLICT: ErrorOut,
    },
    auth=django_auth,
    summary="Vote",
)
def put_vote(request, proposal_id: UUID, payload: VoteIn):
    """409: `proposal_closed` (the proposal is discarded)."""
    record, access = authorize(request, proposal_id)
    try:
        outcome = cast_vote(store(), record.id, str(access.membership.person_id), payload.value)
    except ProposalClosedError as exc:
        raise ApiError(HTTPStatus.CONFLICT, "proposal_closed", "The proposal is discarded") from exc
    return Status(HTTPStatus.OK, tally_out(ProposalView(outcome.proposal, outcome.tally, [])))


@router.delete(
    "/proposals/{proposal_id}/vote",
    response={
        HTTPStatus.OK: VoteTallyOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="Remove Vote",
)
def delete_vote(request, proposal_id: UUID):
    record, access = authorize(request, proposal_id)
    outcome = remove_vote(store(), record.id, str(access.membership.person_id))
    return Status(HTTPStatus.OK, tally_out(ProposalView(outcome.proposal, outcome.tally, [])))


@router.get(
    "/proposals/{proposal_id}/comments",
    response={
        HTTPStatus.OK: list[CommentOut],
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="List Comments",
)
def list_comments(request, proposal_id: UUID):
    record, access = authorize(request, proposal_id)
    comments = store().list_comments(record.id)
    people = person_refs(c.author_id for c in comments)
    me = str(access.membership.person_id)
    return Status(HTTPStatus.OK, [comment_out(c, people, me) for c in comments])


@router.post(
    "/proposals/{proposal_id}/comments",
    response={
        HTTPStatus.CREATED: CommentOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="Add Comment",
)
def post_comment(request, proposal_id: UUID, payload: CommentIn):
    record, access = authorize(request, proposal_id)
    me = str(access.membership.person_id)
    try:
        comment = add_comment(store(), record.id, me, payload.body)
    except InvalidProposalError as exc:
        raise invalid(exc) from exc
    return Status(HTTPStatus.CREATED, comment_out(comment, person_refs([me]), me))


@router.delete(
    "/comments/{comment_id}",
    response={
        HTTPStatus.NO_CONTENT: None,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
    },
    auth=django_auth,
    summary="Delete Comment",
)
def delete_comment(request, comment_id: UUID):
    """Only the author deletes a comment: 403 `forbidden` for any other member."""
    current_person(request)
    found = store().get_comment(str(comment_id))
    if found is None:
        raise not_found()
    comment, trip_id = found
    access = member_of_trip(request, trip_id)
    if comment.author_id != str(access.membership.person_id):
        raise ApiError(HTTPStatus.FORBIDDEN, "forbidden", "Only the author can delete a comment")
    store().delete_comment(comment.id)
    return Status(HTTPStatus.NO_CONTENT, None)


@router.post(
    "/proposals/{proposal_id}/refresh_preview",
    response={
        HTTPStatus.ACCEPTED: QueuedOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.CONFLICT: ErrorOut,
    },
    auth=django_auth,
    summary="Refresh Preview",
)
def refresh_proposal_preview(request, proposal_id: UUID):
    """Queues a new unfurl. 409: `refresh_too_soon` (pending, or fetched in the last 10 minutes).
    404 also when the proposal has no link."""
    record, _ = authorize(request, proposal_id)
    if record.preview is None:
        raise not_found()
    try:
        previews.refresh(record.preview.id)
    except previews.RefreshTooSoonError as exc:
        raise ApiError(
            HTTPStatus.CONFLICT, "refresh_too_soon", "The preview was refreshed moments ago"
        ) from exc
    return Status(HTTPStatus.ACCEPTED, QueuedOut(status="queued"))


@router.get(
    "/proposals/{proposal_id}/thumbnail",
    response={HTTPStatus.UNAUTHORIZED: ErrorOut, HTTPStatus.NOT_FOUND: ErrorOut},
    auth=django_auth,
    summary="Proposal Thumbnail",
)
def proposal_thumbnail(request, proposal_id: UUID):
    """`200 image/webp` (private, one day). 404 without a thumbnail or without access."""
    record, _ = authorize(request, proposal_id)
    data = store().read_thumbnail(record.id)
    if data is None:
        raise not_found()
    response = HttpResponse(data, content_type="image/webp")
    response["Cache-Control"] = "private, max-age=86400"
    response["X-Content-Type-Options"] = "nosniff"
    return response
