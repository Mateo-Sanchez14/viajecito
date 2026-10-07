"""Link-preview thumbnails: a thin wrapper over the shared image routine (``shared.images``)."""

from shared.images import ALLOWED_FORMATS, MAX_IMAGE_BYTES, MAX_PIXELS, ImageError, to_webp

THUMB_BOX = (640, 640)
ThumbnailError = ImageError

__all__ = [
    "ALLOWED_FORMATS",
    "MAX_IMAGE_BYTES",
    "MAX_PIXELS",
    "THUMB_BOX",
    "ThumbnailError",
    "make_thumbnail",
]


def make_thumbnail(data: bytes) -> bytes:
    """Resize to fit 640 px, drop EXIF/ICC/animation and encode as WebP."""
    return to_webp(data, THUMB_BOX)
