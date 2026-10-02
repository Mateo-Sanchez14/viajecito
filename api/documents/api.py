import hashlib
import unicodedata
from datetime import date
from urllib.parse import quote
from uuid import UUID

from cryptography.fernet import InvalidToken
from django.db.models import Q
from django.http import HttpResponse
from ninja import File, Form, Query, Router, Status
from ninja.files import UploadedFile
from ninja.security import django_auth

from documents import conf
from documents.adapters.django_store import DjangoDocumentStore
from documents.domain import DocumentError, validate_fields
from documents.models import Document
from documents.schemas import DocumentOut, DocumentPatchIn
from documents.use_cases.upload_document import upload_document, validate_proposal
from identity.use_cases.display_names import display_names
from shared.api_errors import ApiError, ErrorOut
from trips.api_auth import member_of_trip

router = Router(tags=["documents"], auth=django_auth)
COMMON = {400: ErrorOut, 401: ErrorOut, 403: ErrorOut, 404: ErrorOut}
STATUS = {"file_too_large": 413, "unsupported_type": 415, "quota_exceeded": 507, "not_found": 404}


def failure(exc):
    return ApiError(STATUS.get(exc.code, 400), exc.code, str(exc))


def visible_rows(person_id):
    return Document.objects.filter(Q(visibility="crew") | Q(owner_id=person_id))


def authorize(request, document_id):
    row = visible_rows(request.user.pk).filter(pk=document_id).first()
    if row is None:
        raise ApiError(404, "not_found", "Not found")
    member_of_trip(request, row.trip_id)
    return row


def out(row, person_id):
    names = display_names([str(p) for p in (row.owner_id, row.uploader_id) if p])

    def ref(p):
        return {"person_id": p, "display_name": names.get(str(p), "")} if p else None

    return {
        k: getattr(row, k)
        for k in (
            "id",
            "trip_id",
            "title",
            "kind",
            "mime",
            "size",
            "visibility",
            "valid_until",
            "proposal_id",
            "created_at",
        )
    } | {
        "owner": ref(row.owner_id),
        "uploader": ref(row.uploader_id),
        "download_path": f"/api/documents/{row.pk}/file",
        "can_delete": str(person_id) in (str(row.owner_id), str(row.uploader_id)),
    }


@router.get("/trips/{trip_id}/documents", response={200: list[DocumentOut], **COMMON})
def list_documents(request, trip_id: UUID, kind: Query[str | None] = None):
    member_of_trip(request, trip_id)
    rows = visible_rows(request.user.pk).filter(trip_id=trip_id)
    if kind:
        rows = rows.filter(kind=kind)
    return [out(r, request.user.pk) for r in rows.order_by("-created_at", "id")]


@router.post(
    "/trips/{trip_id}/documents",
    response={201: DocumentOut, 413: ErrorOut, 415: ErrorOut, 507: ErrorOut, **COMMON},
)
def upload(
    request,
    trip_id: UUID,
    file: File[UploadedFile | None] = None,
    title: Form[str | None] = None,
    kind: Form[str] = "other",
    visibility: Form[str | None] = None,
    valid_until: Form[date | None] = None,
    proposal_id: Form[UUID | None] = None,
):
    member_of_trip(request, trip_id)
    if file is None:
        raise ApiError(400, "file_required", "A file is required")
    fields = {"kind": kind, "valid_until": valid_until, "proposal_id": proposal_id}
    if title is not None:
        fields["title"] = title
    if visibility is not None:
        fields["visibility"] = visibility
    try:
        row = upload_document(
            str(trip_id),
            str(request.user.pk),
            file.chunks(),
            file.name,
            fields,
            DjangoDocumentStore(),
            limit=conf.max_upload(),
            quota=conf.quota(),
            allowed=conf.allowed_mime(),
        )
    except DocumentError as exc:
        raise failure(exc) from exc
    return Status(201, out(row, request.user.pk))


@router.get("/documents/{document_id}", response={200: DocumentOut, **COMMON})
def detail(request, document_id: UUID):
    return out(authorize(request, document_id), request.user.pk)


@router.patch("/documents/{document_id}", response={200: DocumentOut, **COMMON})
def update(request, document_id: UUID, payload: DocumentPatchIn):
    row = authorize(request, document_id)
    fields = payload.model_dump(exclude_unset=True)
    if "visibility" in fields and request.user.pk != row.owner_id:
        raise ApiError(403, "forbidden", "Only the owner can change visibility")
    try:
        fields = validate_fields(fields, {"kind": row.kind, "visibility": row.visibility})
        validate_proposal(fields.get("proposal_id"), str(row.trip_id))
    except DocumentError as exc:
        raise failure(exc) from exc
    for k, v in fields.items():
        setattr(row, k, v)
    row.save()
    return out(row, request.user.pk)


@router.get("/documents/{document_id}/file", response={200: None, 500: ErrorOut, **COMMON})
def download(request, document_id: UUID, inline: Query[bool] = False):
    row = authorize(request, document_id)
    try:
        with row.file.open("rb") as handle:
            data = handle.read()
        if len(data) != row.size or hashlib.sha256(data).hexdigest() != row.sha256:
            raise ValueError("Digest mismatch")
    except (InvalidToken, ValueError, OSError) as exc:
        raise ApiError(500, "integrity_error", "Document integrity check failed") from exc
    mode = (
        "inline"
        if inline and (row.mime == "application/pdf" or row.mime.startswith("image/"))
        else "attachment"
    )
    ascii_name = (
        unicodedata.normalize("NFKD", row.original_name)
        .encode("ascii", "ignore")
        .decode()
        .replace('"', "")
        .replace("\\", "")
        or "document"
    )
    response = HttpResponse(data, content_type=row.mime)
    response["Content-Disposition"] = (
        f"{mode}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(row.original_name, safe='')}"
    )
    response["Content-Length"] = str(len(data))
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-store"
    response["Content-Security-Policy"] = "sandbox; default-src 'none'"
    response["Cross-Origin-Resource-Policy"] = "same-origin"
    return response


@router.delete("/documents/{document_id}", response={204: None, **COMMON})
def delete(request, document_id: UUID):
    row = authorize(request, document_id)
    if request.user.pk not in (row.owner_id, row.uploader_id):
        raise ApiError(403, "forbidden", "Only uploader or owner can delete")
    DjangoDocumentStore().delete(row)
    return Status(204, None)
