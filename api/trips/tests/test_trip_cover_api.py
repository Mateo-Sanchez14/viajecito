import io
import uuid
from pathlib import Path

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from PIL import Image

from shared.images import MAX_IMAGE_BYTES
from shared.tests.test_images import png_header_only
from trips.models import Participation, Trip
from trips.tests.conftest import join

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    return tmp_path


@pytest.fixture
def trip(crew, ana):
    created = Trip.objects.create(crew=crew, name="Bariloche")
    Participation.objects.create(trip=created, person=ana, rsvp="in")
    return created


def cover_url(trip):
    return f"/api/trips/{trip.pk}/cover"


def image_bytes(size=(1200, 800), fmt="JPEG", mode="RGB", color="teal", **save):
    buffer = io.BytesIO()
    Image.new(mode, size, color).save(buffer, fmt, **save)
    return buffer.getvalue()


def upload(client, trip, data=None, name="photo.jpg", content_type="image/jpeg"):
    data = image_bytes() if data is None else data
    return client.post(
        cover_url(trip), {"file": SimpleUploadedFile(name, data, content_type=content_type)}
    )


def stored_files(root: Path) -> list[Path]:
    return [p for p in root.rglob("*") if p.is_file()]


def decode(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


# --- authorization ---------------------------------------------------------------------------


def test_anonymous_callers_get_401_on_every_verb(anon, trip):
    for response in (upload(anon, trip), anon.get(cover_url(trip)), anon.delete(cover_url(trip))):
        assert response.status_code == 401
        assert response.json()["code"] == "unauthenticated"


def test_non_members_get_404_and_nothing_is_stored(as_person, stranger, ana, trip, media):
    assert upload(as_person(ana), trip).status_code == 200
    before = stored_files(media)
    client = as_person(stranger)
    for response in (
        upload(client, trip),
        client.get(cover_url(trip)),
        client.delete(cover_url(trip)),
    ):
        assert response.status_code == 404
        assert response.json()["code"] == "not_found"
    assert stored_files(media) == before
    trip.refresh_from_db()
    assert (bool(trip.cover), trip.cover_version) == (True, 1)


def test_non_members_cannot_store_a_cover_at_all(as_person, stranger, trip, media):
    assert upload(as_person(stranger), trip).status_code == 404
    assert stored_files(media) == []
    trip.refresh_from_db()
    assert not trip.cover


def test_removed_members_get_404(as_person, crew, beto, trip):
    crew.memberships.filter(person=beto).update(status="removed")
    assert upload(as_person(beto), trip).status_code == 404


def test_unknown_trips_get_404(as_person, ana):
    client = as_person(ana)
    ghost = uuid.uuid4()
    assert client.post(f"/api/trips/{ghost}/cover").status_code == 404
    assert client.get(f"/api/trips/{ghost}/cover").status_code == 404
    assert client.delete(f"/api/trips/{ghost}/cover").status_code == 404


def test_any_active_member_may_set_and_clear(as_person, beto, trip):
    client = as_person(beto)
    assert upload(client, trip).status_code == 200
    assert client.delete(cover_url(trip)).status_code == 200


def test_unsafe_verbs_require_a_csrf_token(ana, trip):
    client = Client(enforce_csrf_checks=True)
    client.force_login(ana)
    for response in (upload(client, trip), client.delete(cover_url(trip))):
        assert response.status_code == 403
        assert response.json()["code"] == "csrf_failed"
    trip.refresh_from_db()
    assert not trip.cover


def test_a_valid_csrf_token_lets_the_upload_through(ana, trip):
    client = Client(enforce_csrf_checks=True)
    client.force_login(ana)
    token = client.get("/api/auth/csrf").json()["csrf_token"]
    response = client.post(
        cover_url(trip),
        {"file": SimpleUploadedFile("a.jpg", image_bytes(), content_type="image/jpeg")},
        HTTP_X_CSRFTOKEN=token,
    )
    assert response.status_code == 200
    assert client.delete(cover_url(trip), HTTP_X_CSRFTOKEN=token).status_code == 200


# --- upload ----------------------------------------------------------------------------------


def test_a_member_uploads_a_cover_and_gets_the_trip_back(as_person, ana, trip):
    response = upload(as_person(ana), trip)
    assert response.status_code == 200
    body = response.json()
    assert (body["id"], body["has_cover"], body["cover_version"]) == (str(trip.pk), True, 1)
    assert body["name"] == "Bariloche"
    assert body["participants"][0]["display_name"] == "Ana"
    assert body["my_rsvp"] == "in"


def test_the_stored_cover_is_a_webp_inside_the_box(as_person, ana, trip):
    client = as_person(ana)
    upload(client, trip, image_bytes((4000, 3000)))
    image = decode(client.get(cover_url(trip)).content)
    assert image.format == "WEBP"
    assert image.size == (1280, 960)


def test_a_small_cover_is_not_upscaled(as_person, ana, trip):
    client = as_person(ana)
    upload(client, trip, image_bytes((400, 300)))
    assert decode(client.get(cover_url(trip)).content).size == (400, 300)


def test_exif_and_gps_are_stripped(as_person, ana, trip, media):
    exif = Image.Exif()
    exif[0x010F] = "SecretCameraMaker"
    exif[0x8825] = {1: "S"}
    source = image_bytes((900, 600), exif=exif.tobytes())
    assert b"SecretCameraMaker" in source
    client = as_person(ana)
    upload(client, trip, source)
    served = client.get(cover_url(trip)).content
    assert b"SecretCameraMaker" not in served
    assert not decode(served).getexif()
    (path,) = stored_files(media)
    assert b"SecretCameraMaker" not in path.read_bytes()


def test_exif_orientation_is_applied(as_person, ana, trip):
    canvas = Image.new("RGB", (300, 200))
    canvas.paste((255, 0, 0), (0, 0, 150, 200))  # left half red
    canvas.paste((0, 0, 255), (150, 0, 300, 200))  # right half blue
    exif = Image.Exif()
    exif[0x0112] = 6  # displayed rotated 90 clockwise: the left half ends up on top
    buffer = io.BytesIO()
    canvas.save(buffer, "JPEG", exif=exif.tobytes(), quality=95)
    client = as_person(ana)
    upload(client, trip, buffer.getvalue())
    image = decode(client.get(cover_url(trip)).content).convert("RGB")
    assert image.size == (200, 300)
    top, bottom = image.getpixel((100, 40)), image.getpixel((100, 260))
    assert top[0] > 200 > top[2] and bottom[2] > 200 > bottom[0]


@pytest.mark.parametrize(
    ("fmt", "mode", "name", "content_type"),
    [
        ("JPEG", "RGB", "a.jpg", "image/jpeg"),
        ("PNG", "RGBA", "a.png", "image/png"),
        ("WEBP", "RGB", "a.webp", "image/webp"),
        ("GIF", "P", "a.gif", "image/gif"),
    ],
)
def test_jpeg_png_webp_and_gif_are_accepted(as_person, ana, trip, fmt, mode, name, content_type):
    response = upload(as_person(ana), trip, image_bytes((800, 600), fmt, mode), name, content_type)
    assert response.status_code == 200
    assert response.json()["has_cover"] is True


def test_the_format_is_detected_by_content_not_by_the_declared_type(as_person, ana, trip):
    png = image_bytes((300, 200), "PNG")
    assert upload(as_person(ana), trip, png, "evil.svg", "image/svg+xml").status_code == 200


def test_a_missing_file_part_is_400_file_required(as_person, ana, trip):
    response = as_person(ana).post(cover_url(trip), {"other": "x"})
    assert response.status_code == 400
    assert response.json()["code"] == "file_required"


def test_more_than_5_mib_is_413_file_too_large(as_person, ana, trip, media):
    data = b"\xff" * (MAX_IMAGE_BYTES + 1)
    response = upload(as_person(ana), trip, data)
    assert response.status_code == 413
    assert response.json()["code"] == "file_too_large"
    assert stored_files(media) == []


def test_a_megapixel_bomb_is_413_image_too_large(as_person, ana, trip, media):
    for size in ((30_000, 30_000), (5001, 5000)):
        response = upload(as_person(ana), trip, png_header_only(*size), "x.png", "image/png")
        assert response.status_code == 413
        assert response.json()["code"] == "image_too_large"
    assert stored_files(media) == []


@pytest.mark.parametrize(
    ("data", "name", "content_type"),
    [
        (
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
            "a.svg",
            "image/svg+xml",
        ),
        (b'<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>', "a.png", "image/png"),
        (b"random bytes that are not an image", "a.jpg", "image/jpeg"),
        (image_bytes((800, 600))[:300], "cut.jpg", "image/jpeg"),
        (b"\x00\x00\x00\x18ftypheic" + b"\x00" * 64, "a.heic", "image/heic"),
    ],
)
def test_unsupported_content_is_415_unsupported_image(
    as_person, ana, trip, media, data, name, content_type
):
    response = upload(as_person(ana), trip, data, name, content_type)
    assert response.status_code == 415
    assert response.json()["code"] == "unsupported_image"
    assert stored_files(media) == []


def test_errors_never_leak_internals(as_person, ana, trip):
    body = upload(as_person(ana), trip, b"nope").json()
    assert set(body) == {"code", "message"}


# --- replace, version, rejection -------------------------------------------------------------


def test_replacing_bumps_the_version_and_removes_the_old_file(
    as_person, ana, trip, media, django_capture_on_commit_callbacks
):
    client = as_person(ana)
    assert upload(client, trip, image_bytes(color="red")).json()["cover_version"] == 1
    (old,) = stored_files(media)
    with django_capture_on_commit_callbacks(execute=True):
        second = upload(client, trip, image_bytes(color="blue"))
    assert second.json()["cover_version"] == 2
    (new,) = stored_files(media)
    assert new != old and not old.exists()


def test_a_rejected_upload_leaves_the_cover_and_the_version_untouched(as_person, ana, trip, media):
    client = as_person(ana)
    upload(client, trip)
    (stored,) = stored_files(media)
    served = client.get(cover_url(trip)).content
    for bad in (b"not an image", b"\xff" * (MAX_IMAGE_BYTES + 1), png_header_only(30_000, 30_000)):
        assert upload(client, trip, bad).status_code in (413, 415)
    trip.refresh_from_db()
    assert (bool(trip.cover), trip.cover_version) == (True, 1)
    assert stored_files(media) == [stored]
    assert client.get(cover_url(trip)).content == served
    assert client.get(f"/api/trips/{trip.pk}").json()["cover_version"] == 1


# --- retrieval -------------------------------------------------------------------------------


def test_get_serves_the_cover_privately_with_hardening_headers(as_person, ana, beto, trip):
    upload(as_person(ana), trip)
    response = as_person(beto).get(cover_url(trip))
    assert response.status_code == 200
    assert response["Content-Type"] == "image/webp"
    assert response["Cache-Control"] == "private, max-age=604800"
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Cross-Origin-Resource-Policy"] == "same-origin"
    assert decode(response.content).format == "WEBP"


def test_the_version_query_parameter_is_ignored(as_person, ana, trip):
    client = as_person(ana)
    upload(client, trip)
    assert client.get(cover_url(trip) + "?v=1").status_code == 200
    assert client.get(cover_url(trip) + "?v=999").status_code == 200


def test_get_is_404_when_there_is_no_cover(as_person, ana, trip):
    response = as_person(ana).get(cover_url(trip))
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_get_is_404_when_the_file_is_gone_from_storage(as_person, ana, trip, media):
    client = as_person(ana)
    upload(client, trip)
    (stored,) = stored_files(media)
    stored.unlink()
    assert client.get(cover_url(trip)).status_code == 404


def test_the_cover_is_not_reachable_under_media_or_static(as_person, ana, anon, trip):
    upload(as_person(ana), trip)
    trip.refresh_from_db()
    for client in (anon, as_person(ana)):
        for prefix in ("/media/", "/static/"):
            response = client.get(prefix + trip.cover.name)
            assert response.status_code == 404
            assert b"RIFF" not in response.content[:4]


# --- delete ----------------------------------------------------------------------------------


def test_delete_clears_the_cover_and_removes_the_file(
    as_person, ana, trip, media, django_capture_on_commit_callbacks
):
    client = as_person(ana)
    upload(client, trip)
    with django_capture_on_commit_callbacks(execute=True):
        response = client.delete(cover_url(trip))
    assert response.status_code == 200
    body = response.json()
    assert (body["has_cover"], body["cover_version"], body["id"]) == (False, 2, str(trip.pk))
    assert stored_files(media) == []
    assert client.get(cover_url(trip)).status_code == 404
    trip.refresh_from_db()
    assert not trip.cover


def test_delete_is_idempotent_and_does_not_bump_the_version(as_person, ana, trip):
    client = as_person(ana)
    first = client.delete(cover_url(trip))
    second = client.delete(cover_url(trip))
    assert first.status_code == second.status_code == 200
    assert first.json()["has_cover"] is False
    assert (first.json()["cover_version"], second.json()["cover_version"]) == (0, 0)


def test_the_version_differs_after_delete_and_a_new_upload(as_person, ana, trip):
    client = as_person(ana)
    first = upload(client, trip).json()["cover_version"]
    client.delete(cover_url(trip))
    again = upload(client, trip).json()["cover_version"]
    assert again != first
    assert (first, again) == (1, 3)


# --- the trip payloads -----------------------------------------------------------------------


def test_trip_detail_and_list_carry_has_cover_and_cover_version(as_person, ana, crew, trip):
    client = as_person(ana)
    assert client.get(f"/api/trips/{trip.pk}").json()["has_cover"] is False
    upload(client, trip)
    detail = client.get(f"/api/trips/{trip.pk}").json()
    (summary,) = client.get(f"/api/crews/{crew.pk}/trips").json()
    assert (detail["has_cover"], detail["cover_version"]) == (True, 1)
    assert (summary["has_cover"], summary["cover_version"]) == (True, 1)


def test_a_trip_that_never_had_a_cover_reports_false_and_zero(as_person, ana, crew):
    created = Trip.objects.create(crew=crew, name="Old")
    body = as_person(ana).get(f"/api/trips/{created.pk}").json()
    assert (body["has_cover"], body["cover_version"]) == (False, 0)


def test_covers_are_per_trip(as_person, ana, crew, trip):
    other = Trip.objects.create(crew=crew, name="Other")
    client = as_person(ana)
    upload(client, trip)
    assert client.get(cover_url(other)).status_code == 404
    assert client.get(f"/api/trips/{other.pk}").json()["has_cover"] is False


def test_a_cover_is_visible_only_to_the_members_of_its_own_crew(
    as_person, ana, stranger, other_crew, trip
):
    foreign = Trip.objects.create(crew=other_crew, name="Foreign")
    join(other_crew, ana)
    upload(as_person(ana), foreign)
    assert as_person(stranger).get(cover_url(foreign)).status_code == 200
    assert as_person(stranger).get(cover_url(trip)).status_code == 404
