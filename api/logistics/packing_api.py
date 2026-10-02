from uuid import UUID

from ninja import Status

from identity.use_cases.display_names import display_names
from logistics.adapters.packing_store import DjangoPackingStore, entry_data
from logistics.api import COMMON, fail, router
from logistics.copy.es_ar import PACKING_SECTION_LABELS, PACKING_TEMPLATE_LABELS
from logistics.domain import LogisticsError
from logistics.models import PackingApplication, PackingEntry
from logistics.schemas import (
    PackingApplyIn,
    PackingEntryIn,
    PackingEntryOut,
    PackingListOut,
    PackingPatchIn,
    PackingSummaryOut,
)
from logistics.use_cases.packing import apply_template
from shared.api_errors import ApiError
from trips.api_auth import member_of_trip
from trips.use_cases.packing_templates import packing_templates


# Template availability is connected through the core use-case seam at integration.
def available_templates(trip_type):
    return tuple(dict.fromkeys(("generic",) + packing_templates(trip_type) + ("border",)))


def packing_out(trip, person_id):
    rows = DjangoPackingStore().list(str(trip.id), person_id)
    sections = {}
    for row in rows:
        sections.setdefault(
            row.section,
            {
                "key": row.section,
                "label": PACKING_SECTION_LABELS.get(row.section, row.section),
                "entries": [],
            },
        )["entries"].append(entry_data(row))
    return {
        "templates_available": [
            {"key": key, "label": PACKING_TEMPLATE_LABELS[key]}
            for key in available_templates(trip.type)
        ],
        "applied": list(
            PackingApplication.objects.filter(trip=trip, person_id=person_id)
            .order_by("created_at")
            .values_list("template_key", flat=True)
        ),
        "sections": list(sections.values()),
        "progress": {"packed": sum(r.packed for r in rows), "total": len(rows)},
    }


def authorize_entry(request, entry_id):
    row = PackingEntry.objects.filter(pk=entry_id, person_id=request.user.pk).first()
    if row is None:
        raise ApiError(404, "not_found", "Not found")
    member_of_trip(request, row.trip_id)
    return row


@router.get("/trips/{trip_id}/packing/me", response={200: PackingListOut, **COMMON})
def get_packing(request, trip_id: UUID):
    access = member_of_trip(request, trip_id)
    return packing_out(access.trip, str(request.user.pk))


@router.post("/trips/{trip_id}/packing/me/apply", response={200: PackingListOut, **COMMON})
def apply(request, trip_id: UUID, payload: PackingApplyIn):
    access = member_of_trip(request, trip_id)
    try:
        apply_template(
            str(trip_id), str(request.user.pk), payload.template_key, DjangoPackingStore()
        )
    except LogisticsError as exc:
        raise fail(exc) from exc
    return packing_out(access.trip, str(request.user.pk))


@router.post("/trips/{trip_id}/packing/me/entries", response={201: PackingEntryOut, **COMMON})
def add_entry(request, trip_id: UUID, payload: PackingEntryIn):
    member_of_trip(request, trip_id)
    row = PackingEntry.objects.create(
        trip_id=trip_id, person_id=request.user.pk, **payload.model_dump()
    )
    return Status(201, entry_data(row))


@router.patch("/packing_entries/{entry_id}", response={200: PackingEntryOut, **COMMON})
def update_entry(request, entry_id: UUID, payload: PackingPatchIn):
    row = authorize_entry(request, entry_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    row.save()
    return entry_data(row)


@router.delete("/packing_entries/{entry_id}", response={204: None, **COMMON})
def delete_entry(request, entry_id: UUID):
    authorize_entry(request, entry_id).delete()
    return Status(204, None)


@router.get("/trips/{trip_id}/packing/summary", response={200: list[PackingSummaryOut], **COMMON})
def packing_summary(request, trip_id: UUID):
    member_of_trip(request, trip_id)
    rows = PackingEntry.objects.filter(trip_id=trip_id)
    counts = {}
    for row in rows:
        counts.setdefault(str(row.person_id), {"packed": 0, "total": 0})
        counts[str(row.person_id)]["total"] += 1
        counts[str(row.person_id)]["packed"] += row.packed
    names = display_names(list(counts))
    return [
        {"person": {"person_id": p, "display_name": names.get(p, "")}, **counts[p]} for p in counts
    ]
