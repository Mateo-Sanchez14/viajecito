"""Thumbnail generation with Pillow: untrusted bytes in, a small metadata-free WebP out."""

import io
import warnings

from PIL import Image, ImageOps

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 25_000_000
THUMB_BOX = (640, 640)
ALLOWED_FORMATS = frozenset({"JPEG", "PNG", "WEBP", "GIF"})  # never SVG

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class ThumbnailError(ValueError):
    """The image cannot be turned into a thumbnail; ``code`` is a stable reason."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def make_thumbnail(data: bytes) -> bytes:
    """Resize to fit 640 px, drop EXIF/ICC/animation and encode as WebP."""
    if len(data) > MAX_IMAGE_BYTES:
        raise ThumbnailError("too_large")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            probe = Image.open(io.BytesIO(data))
            if probe.format not in ALLOWED_FORMATS:
                raise ThumbnailError("invalid_image")
            width, height = probe.size
            if width * height > MAX_PIXELS:
                raise ThumbnailError("too_many_pixels")
            probe.verify()
            image = Image.open(io.BytesIO(data))  # verify() leaves the file unusable: reopen
            image.seek(0)  # first frame of animations
            image = ImageOps.exif_transpose(image)
            image.load()
    except ThumbnailError:
        raise
    except Image.DecompressionBombError as exc:
        raise ThumbnailError("too_many_pixels") from exc
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombWarning) as exc:
        raise ThumbnailError("invalid_image") from exc

    mode = "RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB"
    image = image.convert(mode)
    image.thumbnail(THUMB_BOX, Image.Resampling.LANCZOS)
    clean = Image.frombytes(mode, image.size, image.tobytes())  # a fresh image: no metadata
    out = io.BytesIO()
    clean.save(out, "WEBP", quality=80)
    return out.getvalue()
