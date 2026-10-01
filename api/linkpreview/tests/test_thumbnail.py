import io
import struct
import zlib

import pytest
from PIL import Image

from linkpreview.adapters.thumbnail import MAX_IMAGE_BYTES, ThumbnailError, make_thumbnail


def image_bytes(size=(1200, 800), fmt="JPEG", mode="RGB", **save):
    buffer = io.BytesIO()
    Image.new(mode, size, "teal").save(buffer, fmt, **save)
    return buffer.getvalue()


def open_webp(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


def test_large_images_are_resized_to_640_wide_webp():
    out = open_webp(make_thumbnail(image_bytes((1600, 900))))
    assert out.format == "WEBP"
    assert out.size == (640, 360)


def test_small_images_are_not_upscaled():
    assert open_webp(make_thumbnail(image_bytes((200, 100)))).size == (200, 100)


@pytest.mark.parametrize(
    ("fmt", "mode"), [("PNG", "RGBA"), ("GIF", "P"), ("WEBP", "RGB"), ("JPEG", "L")]
)
def test_every_allowed_format_is_accepted(fmt, mode):
    assert open_webp(make_thumbnail(image_bytes((800, 800), fmt, mode))).format == "WEBP"


def test_exif_and_icc_are_stripped():
    exif = Image.Exif()
    exif[0x010F] = "SecretCameraMaker"
    exif[0x8825] = {1: "S"}  # GPS IFD pointer
    source = image_bytes((900, 600), exif=exif.tobytes(), icc_profile=b"\x00" * 200)
    assert b"SecretCameraMaker" in source
    result = make_thumbnail(source)
    assert b"SecretCameraMaker" not in result
    image = open_webp(result)
    assert not image.getexif()
    assert "icc_profile" not in image.info


def test_exif_orientation_is_applied_before_stripping():
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 clockwise on display
    out = open_webp(make_thumbnail(image_bytes((300, 200), exif=exif.tobytes())))
    assert out.size == (200, 300)


def test_animated_gif_uses_the_first_frame():
    frames = [Image.new("RGB", (50, 50), color) for color in ("red", "blue")]
    buffer = io.BytesIO()
    frames[0].save(buffer, "GIF", save_all=True, append_images=frames[1:])
    assert open_webp(make_thumbnail(buffer.getvalue())).size == (50, 50)


def test_svg_is_rejected():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>1</script></svg>'
    with pytest.raises(ThumbnailError) as raised:
        make_thumbnail(svg)
    assert raised.value.code == "invalid_image"


@pytest.mark.parametrize("payload", [b"", b"not an image", b"\x89PNG\r\n\x1a\n" + b"junk"])
def test_garbage_is_rejected(payload):
    with pytest.raises(ThumbnailError):
        make_thumbnail(payload)


def png_header_only(width: int, height: int) -> bytes:
    """A PNG that declares a huge canvas without carrying any pixel data."""

    def chunk(kind: bytes, body: bytes) -> bytes:
        crc = zlib.crc32(kind + body) & 0xFFFFFFFF
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(b"\x00"))
        + chunk(b"IEND", b"")
    )


def test_decompression_bombs_are_rejected_before_decoding():
    with pytest.raises(ThumbnailError) as raised:
        make_thumbnail(png_header_only(30_000, 30_000))
    assert raised.value.code == "too_many_pixels"


def test_the_pixel_limit_is_25_megapixels():
    with pytest.raises(ThumbnailError):
        make_thumbnail(png_header_only(5001, 5000))


def test_oversize_files_are_rejected():
    with pytest.raises(ThumbnailError) as raised:
        make_thumbnail(b"\xff" * (MAX_IMAGE_BYTES + 1))
    assert raised.value.code == "too_large"
