import io

import pytest
from PIL import Image

from trips.adapters.cover_image import process_cover
from trips.domain import COVER_BOX, InvalidCoverError


def jpeg(size, **save):
    buffer = io.BytesIO()
    Image.new("RGB", size, "teal").save(buffer, "JPEG", **save)
    return buffer.getvalue()


def decode(data):
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


def test_the_cover_box_is_1280():
    assert COVER_BOX == (1280, 1280)


def test_a_large_image_fits_the_cover_box_as_webp():
    image = decode(process_cover(jpeg((4000, 3000))))
    assert image.format == "WEBP"
    assert image.size == (1280, 960)


def test_a_small_image_is_not_upscaled():
    assert decode(process_cover(jpeg((400, 300)))).size == (400, 300)


def test_orientation_is_applied():
    exif = Image.Exif()
    exif[0x0112] = 6
    assert decode(process_cover(jpeg((300, 200), exif=exif.tobytes()))).size == (200, 300)


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        (b"<svg xmlns='http://www.w3.org/2000/svg'/>", "invalid_image"),
        (b"random bytes", "invalid_image"),
        (b"\xff" * (5 * 1024 * 1024 + 1), "too_large"),
    ],
)
def test_image_errors_are_mapped_to_cover_errors_with_the_same_code(payload, code):
    with pytest.raises(InvalidCoverError) as raised:
        process_cover(payload)
    assert raised.value.code == code
