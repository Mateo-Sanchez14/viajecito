"""Cover processing: untrusted bytes in, a bounded metadata-free WebP out (``shared.images``)."""

from shared.images import ImageError, to_webp
from trips.domain import COVER_BOX, InvalidCoverError

COVER_QUALITY = 82


def process_cover(data: bytes) -> bytes:
    try:
        return to_webp(data, box=COVER_BOX, quality=COVER_QUALITY)
    except ImageError as exc:
        raise InvalidCoverError(exc.code) from exc
