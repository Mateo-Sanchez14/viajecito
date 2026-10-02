from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from django.utils import timezone
from ninja import Query, Router, Status
from ninja.security import django_auth

from identity.use_cases.display_names import display_names
from logistics.adapters.django_store import DjangoTaskStore
from logistics.domain import LogisticsError
from logistics.schemas import TaskCreateIn, TaskOut, TaskPatchIn
from logistics.use_cases.tasks import create_task, update_task
from shared.api_errors import ApiError, ErrorOut
from trips.api_auth import member_of_trip

router = Router(tags=["logistics"], auth=django_auth)
COMMON = {400: ErrorOut, 401: ErrorOut, 403: ErrorOut, 404: ErrorOut}


def out(task, tz):
    names = display_names([p for p in (task["owner_id"], task["done_by_id"]) if p])

    def ref(person):
        return {"person_id": person, "display_name": names.get(person, "")} if person else None

    return {
        **task,
        "owner": ref(task["owner_id"]),
        "done_by": ref(task["done_by_id"]),
        "overdue": task["status"] != "done"
        and task["due_on"] is not None
        and task["due_on"] < datetime.now(ZoneInfo(tz)).date(),
    }


def authorize(request, task_id):
    task = DjangoTaskStore().get(str(task_id))
    if task is None:
        raise ApiError(404, "not_found", "Not found")
    return member_of_trip(request, task["trip_id"])


def fail(exc):
    return ApiError(404 if exc.code == "not_found" else 400, exc.code, str(exc))


@router.get("/trips/{trip_id}/tasks", response={200: list[TaskOut], **COMMON})
def list_tasks(
    request,
    trip_id: UUID,
    status: Query[list[str] | None] = None,
    kind: Query[str | None] = None,
    owner: Query[str | None] = None,
):
    access = member_of_trip(request, trip_id)
    if (
        status
        and any(s not in ("open", "done", "blocked") for s in status)
        or kind
        and kind not in ("todo", "bring", "booking")
    ):
        raise ApiError(400, "invalid_request", "Invalid filter")
    if owner == "me":
        owner = str(request.user.pk)
    if owner:
        try:
            owner = str(UUID(owner))
        except ValueError as exc:
            raise ApiError(400, "invalid_request", "Invalid owner filter") from exc
    return [
        out(t, access.trip.timezone)
        for t in DjangoTaskStore().list(str(trip_id), status, kind, owner)
    ]


@router.post("/trips/{trip_id}/tasks", response={201: TaskOut, **COMMON})
def create(request, trip_id: UUID, payload: TaskCreateIn):
    access = member_of_trip(request, trip_id)
    try:
        task = create_task(
            str(trip_id),
            str(access.trip.crew_id),
            str(request.user.pk),
            payload.model_dump(),
            DjangoTaskStore(),
        )
    except LogisticsError as exc:
        raise fail(exc) from exc
    return Status(201, out(task, access.trip.timezone))


@router.patch("/tasks/{task_id}", response={200: TaskOut, **COMMON})
def update(request, task_id: UUID, payload: TaskPatchIn):
    access = authorize(request, task_id)
    try:
        task = update_task(
            str(task_id),
            str(access.trip.crew_id),
            str(request.user.pk),
            payload.model_dump(exclude_unset=True),
            DjangoTaskStore(),
            timezone.now(),
        )
    except LogisticsError as exc:
        raise fail(exc) from exc
    return out(task, access.trip.timezone)


@router.delete("/tasks/{task_id}", response={204: None, **COMMON})
def delete(request, task_id: UUID):
    authorize(request, task_id)
    DjangoTaskStore().delete(str(task_id))
    return Status(204, None)


# The packing transport registers on the same router after its common helpers exist.
from logistics import packing_api  # noqa: E402,F401
