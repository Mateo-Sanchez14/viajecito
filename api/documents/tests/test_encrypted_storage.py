from pathlib import Path

import pytest
from cryptography.fernet import Fernet, InvalidToken
from django.core.files.base import ContentFile

from documents.storage import EncryptedFileSystemStorage


@pytest.fixture
def storage(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    settings.DOCUMENTS_FERNET_KEYS = Fernet.generate_key().decode()
    return EncryptedFileSystemStorage()


def test_roundtrip_ciphertext_and_private(storage):
    name = storage.save("vault/trip/sample.pdf.enc", ContentFile(b"%PDF-1.7 private"))
    assert Path(storage.path(name)).read_bytes() != b"%PDF-1.7 private"
    assert storage.open(name).read() == b"%PDF-1.7 private"
    with pytest.raises(NotImplementedError):
        storage.url(name)


def test_rotation_and_tamper(storage, settings):
    old = settings.DOCUMENTS_FERNET_KEYS
    name = storage.save("vault/trip/old.pdf.enc", ContentFile(b"secret"))
    new = Fernet.generate_key().decode()
    settings.DOCUMENTS_FERNET_KEYS = f"{new},{old}"
    assert storage.open(name).read() == b"secret"
    second = storage.save("vault/trip/new.pdf.enc", ContentFile(b"new"))
    assert Fernet(new).decrypt(Path(storage.path(second)).read_bytes()) == b"new"
    Path(storage.path(name)).write_bytes(b"tampered")
    with pytest.raises(InvalidToken):
        storage.open(name)
