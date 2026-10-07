"""Image normalization with Pillow: untrusted bytes in, a bounded metadata-free WebP out.

Shared by every capability that stores a user-supplied picture (link-preview thumbnails, trip
covers). It depends on Pillow only, never on another project package.
"""

import io
import warnings

from PIL import Image, ImageOps

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 25_000_000
ALLOWED_FORMATS = frozenset({"JPEG", "PNG", "WEBP", "GIF"})  # detected by content; never SVG

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class ImageError(ValueError):
    """The image cannot be processed; ``code`` is a stable reason:
    ``too_large`` | ``too_many_pixels`` | ``invalid_image``."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def to_webp(data: bytes, box: tuple[int, int], quality: int = 80) -> bytes:
    """Fit the image inside ``box`` (never upscaling), drop EXIF/ICC/animation, encode as WebP.

    EXIF orientation is applied before the metadata is dropped, so the pixels come out upright.
    """
    if len(data) > MAX_IMAGE_BYTES:
        raise ImageError("too_large")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            probe = Image.open(io.BytesIO(data))
            if probe.format not in ALLOWED_FORMATS:
                raise ImageError("invalid_image")
            width, height = probe.size
            if width * height > MAX_PIXELS:
                raise ImageError("too_many_pixels")
            probe.verify()
            image = Image.open(io.BytesIO(data))  # verify() leaves the file unusable: reopen
            image.seek(0)  # first frame of animations
            image = ImageOps.exif_transpose(image)
            image.load()
    except ImageError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ImageError("too_many_pixels") from exc  # Pillow's own pixel guard fired at open
    except (OSError, SyntaxError, ValueError) as exc:
        raise ImageError("invalid_image") from exc

    mode = "RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB"
    image = image.convert(mode)
    image.thumbnail(box, Image.Resampling.LANCZOS)
    clean = Image.frombytes(mode, image.size, image.tobytes())  # a fresh image: no metadata
    out = io.BytesIO()
    clean.save(out, "WEBP", quality=quality)
    return out.getvalue()
