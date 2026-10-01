import stat

import pytest
from django.test import Client

from config.version import VERSION
from ops import checks


@pytest.fixture
def client():
    return Client()


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    return settings.MEDIA_ROOT


@pytest.mark.django_db
def test_health_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "version": VERSION,
        "checks": {"db": "ok", "media": "ok"},
    }


def test_health_degraded_when_db_check_fails(client, monkeypatch):
    monkeypatch.setattr(checks, "check_db", lambda: "error")
    response = client.get("/api/health")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["db"] == "error"
    assert body["checks"]["media"] == "ok"


@pytest.mark.django_db
def test_health_degraded_when_media_not_writable(client, media_root):
    media_root.mkdir()
    media_root.chmod(stat.S_IRUSR | stat.S_IXUSR)
    try:
        response = client.get("/api/health")
    finally:
        media_root.chmod(stat.S_IRWXU)
    assert response.status_code == 503
    assert response.json()["checks"] == {"db": "ok", "media": "error"}


@pytest.mark.django_db
def test_check_media_creates_missing_directory_and_leaves_no_probe(media_root):
    assert not media_root.exists()
    assert checks.check_media() == "ok"
    assert media_root.is_dir()
    assert list(media_root.iterdir()) == []


@pytest.mark.django_db
def test_check_db_ok():
    assert checks.check_db() == "ok"
