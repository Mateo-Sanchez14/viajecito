from pathlib import PurePosixPath

from documents.domain import DocumentError, validate_fields, validate_upload
from proposals.use_cases.get_proposal_snapshot import get_proposal_snapshot


def validate_proposal(proposal_id, trip_id):
    if proposal_id is not None:
        proposal = get_proposal_snapshot(str(proposal_id))
        if proposal is None or proposal.trip_id != str(trip_id):
            raise DocumentError("not_found", "Not found")


def upload_document(trip_id, person_id, chunks, name, fields, store, *, limit, quota, allowed):
    fields = validate_fields(fields)
    validate_proposal(fields.get("proposal_id"), trip_id)
    data, mime, name, digest = validate_upload(chunks, name, limit, allowed)
    fields.setdefault("title", PurePosixPath(name).stem[:200] or "document")
    with store.atomic():
        return store.create(trip_id, person_id, data, mime, name, digest, fields, quota)
