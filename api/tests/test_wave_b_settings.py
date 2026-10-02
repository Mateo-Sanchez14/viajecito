"""Wave B configuration remains deterministic locally and fails closed in production."""

import importlib

import pytest
from cryptography.fernet import Fernet, MultiFernet
from django.core.exceptions import ImproperlyConfigured

KEY = "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA="
OLD_KEY = "MTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTE="
MIME = ("application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif")


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch):
    for name in (
        "DOCUMENTS_FERNET_KEYS",
        "DOCUMENTS_MAX_UPLOAD_BYTES",
        "DOCUMENTS_TRIP_QUOTA_BYTES",
        "DOCUMENTS_ALLOWED_MIME",
        "LOGISTICS_NAG_LEAD_DAYS",
        "FILE_UPLOAD_MAX_MEMORY_SIZE",
        "DATA_UPLOAD_MAX_MEMORY_SIZE",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("DJANGO_SECRET_KEY", "x" * 50)
    monkeypatch.setenv("OTP_PEPPER", "p" * 32)
    monkeypatch.setenv("GOWA_WEBHOOK_SECRET", "w" * 32)
    monkeypatch.setenv("WHATSAPP_PROVIDER", "gowa")
    yield
    monkeypatch.undo()
    importlib.reload(importlib.import_module("config.settings.base"))


def load(module="base"):
    base = importlib.reload(importlib.import_module("config.settings.base"))
    return (
        base
        if module == "base"
        else importlib.reload(importlib.import_module(f"config.settings.{module}"))
    )


def test_defaults_and_upload_memory_budget():
    base = load()
    assert base.LOGISTICS_NAG_LEAD_DAYS == 3
    assert base.DOCUMENTS_MAX_UPLOAD_BYTES == 15 * 1024 * 1024
    assert base.DOCUMENTS_TRIP_QUOTA_BYTES == 1024 * 1024 * 1024
    assert base.DOCUMENTS_ALLOWED_MIME == MIME
    assert base.DOCUMENTS_FERNET_KEYS == ()
    assert base.FILE_UPLOAD_MAX_MEMORY_SIZE == 2_621_440
    assert base.DATA_UPLOAD_MAX_MEMORY_SIZE == 2_621_440


def test_env_values_preserve_order_and_mime_tuple(monkeypatch):
    values = {
        "LOGISTICS_NAG_LEAD_DAYS": "7",
        "DOCUMENTS_MAX_UPLOAD_BYTES": "4096",
        "DOCUMENTS_TRIP_QUOTA_BYTES": "8192",
        "DOCUMENTS_ALLOWED_MIME": "application/pdf, image/png",
        "DOCUMENTS_FERNET_KEYS": f" {KEY}, {OLD_KEY} ",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    base = load()
    assert (
        base.LOGISTICS_NAG_LEAD_DAYS,
        base.DOCUMENTS_MAX_UPLOAD_BYTES,
        base.DOCUMENTS_TRIP_QUOTA_BYTES,
    ) == (7, 4096, 8192)
    assert base.DOCUMENTS_ALLOWED_MIME == ("application/pdf", "image/png")
    assert base.DOCUMENTS_FERNET_KEYS == (KEY, OLD_KEY)


@pytest.mark.parametrize("module", ["dev", "test"])
def test_local_keys_are_stable_across_reload(module):
    first = load(module).DOCUMENTS_FERNET_KEYS
    ciphertext = MultiFernet([Fernet(k) for k in first]).encrypt(b"persistent vault")
    second = load(module).DOCUMENTS_FERNET_KEYS
    assert first == second and first
    assert MultiFernet([Fernet(k) for k in second]).decrypt(ciphertext) == b"persistent vault"


@pytest.mark.parametrize("module", ["dev", "test", "prod"])
def test_configured_keys_override_local_fallback_and_support_rotation(monkeypatch, module):
    monkeypatch.setenv("DOCUMENTS_FERNET_KEYS", f"{KEY},{OLD_KEY}")
    configured = load(module).DOCUMENTS_FERNET_KEYS
    assert configured == (KEY, OLD_KEY)
    cipher = MultiFernet([Fernet(k) for k in configured])
    assert cipher.decrypt(Fernet(OLD_KEY).encrypt(b"old")) == b"old"
    assert Fernet(KEY).decrypt(cipher.encrypt(b"new")) == b"new"


@pytest.mark.parametrize(
    "raw", [None, "", " ", "invalid-secret-value", f"{KEY},invalid-secret-value", f"{KEY},"]
)
def test_prod_rejects_missing_or_any_invalid_key_without_disclosing_it(monkeypatch, raw):
    if raw is not None:
        monkeypatch.setenv("DOCUMENTS_FERNET_KEYS", raw)
    with pytest.raises(ImproperlyConfigured, match="DOCUMENTS_FERNET_KEYS") as error:
        load("prod")
    assert "invalid-secret-value" not in str(error.value)
    assert error.value.__suppress_context__


@pytest.mark.parametrize(
    "name,raw",
    [
        ("DOCUMENTS_MAX_UPLOAD_BYTES", "0"),
        ("DOCUMENTS_TRIP_QUOTA_BYTES", "-1"),
        ("LOGISTICS_NAG_LEAD_DAYS", "-1"),
    ],
)
def test_invalid_resource_limits_fail_early(monkeypatch, name, raw):
    monkeypatch.setenv(name, raw)
    with pytest.raises(Exception, match=name):
        load()


def test_large_multipart_file_spools_without_consuming_metadata_budget():
    from django.core.files.uploadedfile import SimpleUploadedFile, TemporaryUploadedFile
    from django.test import RequestFactory

    request = RequestFactory().post(
        "/api/trips/test/documents",
        {
            "title": "Large document",
            "file": SimpleUploadedFile(
                "file.pdf", b"x" * (3 * 1024 * 1024), content_type="application/pdf"
            ),
        },
    )
    upload = request.FILES["file"]
    try:
        assert isinstance(upload, TemporaryUploadedFile)
        assert upload.size == 3 * 1024 * 1024
        assert request.POST["title"] == "Large document"
    finally:
        upload.close()
