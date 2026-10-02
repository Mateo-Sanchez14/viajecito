import hashlib
from pathlib import PurePosixPath

MIME_EXT = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
}


class DocumentError(ValueError):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def sniff_mime(data):
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if len(data) >= 16 and data[4:8] == b"ftyp":
        brands = [data[i : i + 4] for i in [8, *range(16, min(len(data), 64), 4)]]
        if any(b in (b"heic", b"heix", b"hevc", b"hevx") for b in brands):
            return "image/heic"
        if any(b in (b"mif1", b"msf1") for b in brands):
            return "image/heif"
    raise DocumentError("unsupported_type", "Only PDF and supported photos are accepted")


def sanitize_name(raw):
    name = PurePosixPath(raw.replace("\\", "/")).name
    name = "".join(c for c in name if ord(c) >= 32 and ord(c) != 127)
    return name[:200] or "document"


def validate_upload(chunks, original_name, limit, allowed):
    data = bytearray()
    for chunk in chunks:
        if len(data) + len(chunk) > limit:
            raise DocumentError("file_too_large", "Upload limit exceeded")
        data.extend(chunk)
    mime = sniff_mime(data)
    if mime not in allowed:
        raise DocumentError("unsupported_type", "File type is not permitted")
    return bytes(data), mime, sanitize_name(original_name), hashlib.sha256(data).hexdigest()


def validate_fields(fields, current=None):
    combined = {**(current or {}), **fields}
    kind = combined.get("kind", "other")
    visibility = combined.get("visibility", "owner_only" if kind == "id" else "crew")
    if kind not in (
        "reservation",
        "ticket",
        "insurance",
        "id",
        "photo",
        "other",
    ) or visibility not in ("crew", "owner_only"):
        raise DocumentError("invalid_request", "Invalid document fields")
    if kind == "id" and visibility != "owner_only":
        raise DocumentError("id_must_be_private", "Identity documents must be private")
    if "title" in fields and (
        not isinstance(fields["title"], str) or not 1 <= len(fields["title"].strip()) <= 200
    ):
        raise DocumentError("invalid_request", "Title must contain 1–200 characters")
    return {**fields, "kind": kind, "visibility": visibility}
