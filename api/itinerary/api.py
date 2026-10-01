"""Member-scoped itinerary endpoints; cookie authentication enforces CSRF."""

from dataclasses import asdict
from datetime import date
from uuid import UUID
from zoneinfo import ZoneInfo

from ninja import Router, Status
from ninja.security import django_auth

from crews.api_auth import current_person
from crews.use_cases.active_member_ids import active_member_ids
from identity.use_cases.display_names import display_names
from itinerary.domain import ItineraryError
from itinerary.ports import default_store
from itinerary.schemas import (
    DayIn,
    DayOut,
    EntryIn,
    EntryOut,
    EntryPatchIn,
    ItineraryOut,
    MoveIn,
    NoteIn,
    NoteOut,
    NotePatchIn,
)
from itinerary.use_cases.planner import itinerary, save_day, write_entry, write_note
from shared.api_errors import ApiError, ErrorOut
from trips.api_auth import member_of_trip

router = Router(tags=["itinerary"], auth=django_auth)
ERRORS = {400: ErrorOut, 401: ErrorOut, 403: ErrorOut, 404: ErrorOut, 409: ErrorOut}


def call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ItineraryError as exc:
        raise ApiError(exc.status, exc.code, str(exc)) from exc


def entry_out(e, tz):
    values = asdict(e)
    values.pop("created_at")
    zone = ZoneInfo(tz)
    values["start_time"] = e.starts_at.astimezone(zone).strftime("%H:%M") if e.starts_at else None
    values["end_time"] = e.ends_at.astimezone(zone).strftime("%H:%M") if e.ends_at else None
    return EntryOut(**values)


def day_out(d, tz):
    return DayOut(
        date=d.date,
        title=d.title,
        notes=d.notes,
        is_virtual=d.is_virtual,
        entries=[entry_out(e, tz) for e in d.entries],
    )


def note_outputs(notes, trip, me):
    names = display_names([n.author_id for n in notes])
    active = set(active_member_ids(str(trip.crew_id)))
    return [
        NoteOut(
            id=n.id,
            author={"person_id": n.author_id, "display_name": names.get(n.author_id, "")},
            body=n.body,
            pinned=n.pinned,
            created_at=n.created_at,
            can_delete=n.author_id == me or n.author_id not in active,
        )
        for n in notes
    ]


def owned(request, kind, key):
    current_person(request)
    store = default_store()
    row = store.get_entry(str(key)) if kind == "entry" else store.get_note(str(key))
    if row is None:
        raise ApiError(404, "not_found", "Not found")
    return row, member_of_trip(request, row.trip_id)


def changes(payload):
    fields = payload.model_dump(exclude_unset=True)
    nullable = {"day_date", "start_time", "end_time", "lat", "lng"}
    if any(value is None and key not in nullable for key, value in fields.items()):
        raise ApiError(400, "invalid_request", "Null is not accepted for this field")
    return fields


@router.get("/trips/{trip_id}/itinerary", response={200: ItineraryOut, **ERRORS})
def get_itinerary(request, trip_id: UUID):
    access = member_of_trip(request, trip_id)
    data = itinerary(access.trip)
    return ItineraryOut(
        timezone=data["timezone"],
        start_on=data["start_on"],
        end_on=data["end_on"],
        days=[day_out(d, access.trip.timezone) for d in data["days"]],
        tray=[entry_out(e, access.trip.timezone) for e in data["tray"]],
        out_of_range=[entry_out(e, access.trip.timezone) for e in data["out_of_range"]],
    )


@router.put("/trips/{trip_id}/itinerary/days/{day_date}", response={200: DayOut, **ERRORS})
def put_day(request, trip_id: UUID, day_date: date, payload: DayIn):
    access = member_of_trip(request, trip_id)
    d = call(save_day, access.trip, day_date, payload.model_dump(exclude_unset=True))
    return day_out(d, access.trip.timezone)


@router.post("/trips/{trip_id}/itinerary/entries", response={201: EntryOut, **ERRORS})
def post_entry(request, trip_id: UUID, payload: EntryIn):
    access = member_of_trip(request, trip_id)
    e = call(write_entry, access.trip, str(access.membership.person_id), payload.model_dump())
    return Status(201, entry_out(e, access.trip.timezone))


@router.patch("/itinerary_entries/{entry_id}", response={200: EntryOut, **ERRORS})
def patch_entry(request, entry_id: UUID, payload: EntryPatchIn):
    row, access = owned(request, "entry", entry_id)
    e = call(write_entry, access.trip, str(access.membership.person_id), changes(payload), row)
    return entry_out(e, access.trip.timezone)


@router.post("/itinerary_entries/{entry_id}/move", response={200: DayOut, **ERRORS})
def move_entry(request, entry_id: UUID, payload: MoveIn):
    _, access = owned(request, "entry", entry_id)
    return day_out(
        call(default_store().move_entry, str(entry_id), payload.direction), access.trip.timezone
    )


@router.delete("/itinerary_entries/{entry_id}", response={204: None, **ERRORS})
def delete_entry(request, entry_id: UUID):
    owned(request, "entry", entry_id)
    default_store().delete_entry(str(entry_id))
    return Status(204, None)


@router.get("/trips/{trip_id}/notes", response={200: list[NoteOut], **ERRORS})
def get_notes(request, trip_id: UUID, pinned: bool | None = None):
    access = member_of_trip(request, trip_id)
    notes = default_store().notes(str(trip_id))
    if pinned is not None:
        notes = [n for n in notes if n.pinned == pinned]
    return note_outputs(notes[:50], access.trip, str(access.membership.person_id))


@router.post("/trips/{trip_id}/notes", response={201: NoteOut, **ERRORS})
def post_note(request, trip_id: UUID, payload: NoteIn):
    access = member_of_trip(request, trip_id)
    me = str(access.membership.person_id)
    n = call(write_note, access.trip, me, payload.model_dump())
    return Status(201, note_outputs([n], access.trip, me)[0])


@router.patch("/notes/{note_id}", response={200: NoteOut, **ERRORS})
def patch_note(request, note_id: UUID, payload: NotePatchIn):
    row, access = owned(request, "note", note_id)
    me = str(access.membership.person_id)
    n = call(write_note, access.trip, me, changes(payload), row)
    return note_outputs([n], access.trip, me)[0]


@router.delete("/notes/{note_id}", response={204: None, **ERRORS})
def delete_note(request, note_id: UUID):
    row, access = owned(request, "note", note_id)
    if row.author_id != str(access.membership.person_id) and row.author_id in active_member_ids(
        str(access.trip.crew_id)
    ):
        raise ApiError(403, "forbidden", "Only the active author can delete this note")
    default_store().delete_note(str(note_id))
    return Status(204, None)
