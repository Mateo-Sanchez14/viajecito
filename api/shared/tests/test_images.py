import io
import struct
import zlib

import pytest
from PIL import Image

from shared.images import MAX_IMAGE_BYTES, MAX_PIXELS, ImageError, to_webp

BOX = (1280, 1280)


def image_bytes(size=(1200, 800), fmt="JPEG", mode="RGB", **save):
    buffer = io.BytesIO()
    Image.new(mode, size, "teal").save(buffer, fmt, **save)
    return buffer.getvalue()


def open_webp(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


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


def test_a_large_image_fits_the_box_keeping_its_aspect_ratio():
    out = open_webp(to_webp(image_bytes((4000, 3000)), BOX))
    assert out.format == "WEBP"
    assert out.size == (1280, 960)


def test_a_small_image_is_not_upscaled():
    assert open_webp(to_webp(image_bytes((400, 300)), BOX)).size == (400, 300)


def test_the_box_is_a_parameter():
    assert open_webp(to_webp(image_bytes((1600, 900)), (640, 640))).size == (640, 360)


def test_quality_is_a_parameter():
    source = Image.effect_noise((600, 600), 64).convert("RGB")
    buffer = io.BytesIO()
    source.save(buffer, "PNG")
    low = to_webp(buffer.getvalue(), BOX, quality=20)
    high = to_webp(buffer.getvalue(), BOX, quality=95)
    assert len(low) < len(high)


@pytest.mark.parametrize(
    ("fmt", "mode"), [("PNG", "RGBA"), ("GIF", "P"), ("WEBP", "RGB"), ("JPEG", "L")]
)
def test_every_allowed_format_is_accepted(fmt, mode):
    assert open_webp(to_webp(image_bytes((800, 800), fmt, mode), BOX)).format == "WEBP"


def test_exif_orientation_is_applied_before_the_metadata_is_dropped():
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 clockwise on display
    out = open_webp(to_webp(image_bytes((300, 200), exif=exif.tobytes()), BOX))
    assert out.size == (200, 300)


def test_gps_and_other_metadata_are_stripped():
    exif = Image.Exif()
    exif[0x010F] = "SecretCameraMaker"
    exif[0x8825] = {1: "S"}  # GPS IFD pointer
    source = image_bytes((900, 600), exif=exif.tobytes(), icc_profile=b"\x00" * 200)
    assert b"SecretCameraMaker" in source
    result = to_webp(source, BOX)
    assert b"SecretCameraMaker" not in result
    image = open_webp(result)
    assert not image.getexif()
    assert "icc_profile" not in image.info


def test_svg_is_rejected():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>1</script></svg>'
    with pytest.raises(ImageError) as raised:
        to_webp(svg, BOX)
    assert raised.value.code == "invalid_image"


@pytest.mark.parametrize("payload", [b"", b"not an image", b"\x89PNG\r\n\x1a\n" + b"junk"])
def test_undecodable_bytes_are_rejected(payload):
    with pytest.raises(ImageError) as raised:
        to_webp(payload, BOX)
    assert raised.value.code == "invalid_image"


def test_a_truncated_image_is_rejected():
    with pytest.raises(ImageError) as raised:
        to_webp(image_bytes((800, 600))[:400], BOX)
    assert raised.value.code == "invalid_image"


def test_a_megapixel_bomb_is_rejected_before_decoding():
    with pytest.raises(ImageError) as raised:
        to_webp(png_header_only(30_000, 30_000), BOX)
    assert raised.value.code == "too_many_pixels"


def test_the_pixel_limit_is_25_megapixels():
    assert MAX_PIXELS == 25_000_000
    with pytest.raises(ImageError) as raised:
        to_webp(png_header_only(5001, 5000), BOX)
    assert raised.value.code == "too_many_pixels"


def test_oversize_files_are_rejected_by_bytes():
    with pytest.raises(ImageError) as raised:
        to_webp(b"\xff" * (MAX_IMAGE_BYTES + 1), BOX)
    assert raised.value.code == "too_large"
