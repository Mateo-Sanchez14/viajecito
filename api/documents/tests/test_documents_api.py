from pathlib import Path

import pytest
from cryptography.fernet import Fernet
from django.core.files.uploadedfile import SimpleUploadedFile

from logistics.tests.conftest import send

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def vault(settings, tmp_path):
    settings.DOCUMENTS_FERNET_KEYS = Fernet.generate_key().decode()
    settings.MEDIA_ROOT = tmp_path


PDF = b"%PDF-1.7\nprivate"


def upload(client, trip, data=PDF, name="ticket.pdf", **fields):
    return client.post(
        f"/api/trips/{trip.pk}/documents",
        {"file": SimpleUploadedFile(name, data, content_type="text/html"), **fields},
    )


def test_private_ids_and_download_headers(trip, ana, beto, stranger, as_person):
    client = as_person(ana)
    assert upload(client, trip, kind="id", visibility="crew").json()["code"] == "id_must_be_private"
    result = upload(client, trip, kind="id")
    assert result.status_code == 201
    row = result.json()
    assert row["visibility"] == "owner_only" and row["mime"] == "application/pdf"
    url = f"/api/documents/{row['id']}"
    assert as_person(beto).get(f"/api/trips/{trip.pk}/documents").json() == []
    for suffix in ("", "/file"):
        assert as_person(beto).get(url + suffix).status_code == 404
        assert as_person(stranger).get(url + suffix).status_code == 404
    response = client.get(url + "/file")
    assert response.status_code == 200 and response.content == PDF
    assert response["Cache-Control"] == "private, no-store"
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Content-Security-Policy"] == "sandbox; default-src 'none'"
    assert response["Cross-Origin-Resource-Policy"] == "same-origin"
    assert (
        "attachment;" in response["Content-Disposition"]
        and "filename*=" in response["Content-Disposition"]
    )
    assert "inline;" in client.get(url + "/file?inline=true")["Content-Disposition"]
    assert send(client, "patch", url, {"visibility": "crew"}).json()["code"] == "id_must_be_private"
    assert send(client, "delete", url).status_code == 204
    assert client.get(url + "/file").status_code == 404


def test_limits_magic_quota_and_filename(trip, ana, as_person, settings):
    client = as_person(ana)
    for data, name in [
        (b"<svg/>", "x.svg"),
        (b"PK\x03\x04bad", "x.pdf"),
        (b"MZbad", "fake.pdf.exe"),
    ]:
        assert upload(client, trip, data, name).status_code == 415
    settings.DOCUMENTS_MAX_UPLOAD_BYTES = 3
    assert upload(client, trip).status_code == 413
    settings.DOCUMENTS_MAX_UPLOAD_BYTES = 1024
    settings.DOCUMENTS_TRIP_QUOTA_BYTES = 3
    assert upload(client, trip).status_code == 507
    settings.DOCUMENTS_TRIP_QUOTA_BYTES = 1024
    result = upload(client, trip, name="../../private.pdf")
    assert result.status_code == 201
    from documents.models import Document

    row = Document.objects.get(pk=result.json()["id"])
    assert row.file.name.startswith(f"vault/{trip.pk}/")
    assert ".." not in row.file.name and row.original_name == "private.pdf"
    assert Path(row.file.path).read_bytes() != PDF
    Path(row.file.path).write_bytes(b"tampered")
    error = client.get(result.json()["download_path"])
    assert error.status_code == 500 and error.json()["code"] == "integrity_error"


def test_crew_edit_delete_permissions(trip, ana, beto, as_person):
    row = upload(as_person(ana), trip).json()
    url = f"/api/documents/{row['id']}"
    assert send(as_person(beto), "patch", url, {"title": "Updated"}).status_code == 200
    assert send(as_person(beto), "patch", url, {"visibility": "owner_only"}).status_code == 403
    assert send(as_person(beto), "delete", url).status_code == 403


@pytest.mark.parametrize(
    "data,mime,name",
    [
        (b"\xff\xd8\xffphoto", "image/jpeg", "x.jpg"),
        (b"\x89PNG\r\n\x1a\nphoto", "image/png", "x.png"),
        (b"RIFF\x00\x00\x00\x00WEBPphoto", "image/webp", "x.webp"),
        (b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00heic", "image/heic", "x.heic"),
        (b"\x00\x00\x00\x18ftypmif1\x00\x00\x00\x00mif1", "image/heif", "x.heif"),
    ],
)
def test_allowed_images_sniff_server_side(trip, ana, as_person, data, mime, name):
    response = upload(as_person(ana), trip, data, name)
    assert response.status_code == 201 and response.json()["mime"] == mime


@pytest.mark.parametrize(
    "name", ["../../etc/passwd", "..\\..\\x", "/absolute/secret.pdf", "x\x00.pdf", "x\n.pdf", ".."]
)
def test_original_name_cannot_control_paths(name):
    from documents.domain import sanitize_name

    safe = sanitize_name(name)
    assert "/" not in safe and "\\" not in safe and "\x00" not in safe and "\n" not in safe


def test_missing_file_and_csrf(trip, ana, as_person):
    from django.test import Client

    client = as_person(ana)
    assert client.post(f"/api/trips/{trip.pk}/documents", {}).json()["code"] == "file_required"
    csrf_client = Client(enforce_csrf_checks=True)
    csrf_client.force_login(ana)
    assert upload(csrf_client, trip).status_code == 403


def test_delete_removes_ciphertext_and_releases_quota(
    trip, ana, as_person, django_capture_on_commit_callbacks
):
    from documents.models import Document, VaultQuota

    client = as_person(ana)
    row = upload(client, trip).json()
    model = Document.objects.get(pk=row["id"])
    path = Path(model.file.path)
    with django_capture_on_commit_callbacks(execute=True):
        assert send(client, "delete", f"/api/documents/{row['id']}").status_code == 204
    assert not path.exists() and VaultQuota.objects.get(pk=trip.pk).plaintext_bytes == 0
