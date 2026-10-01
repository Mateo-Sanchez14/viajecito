"""Authenticated whole-file storage for strictly bounded (15 MiB by default) documents.

Fernet authenticates before exposing bytes. Encryption uses an atomic temp-file rename.
Protection covers storage theft/disposal only; the process can access keys on the same host.
use a separately reviewed authenticated streaming format, not concatenated independent tokens.
"""

import os
import tempfile

from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.utils.deconstruct import deconstructible

from documents.conf import cipher, max_upload


@deconstructible
class EncryptedFileSystemStorage(FileSystemStorage):
    def _save(self, name, content):
        plaintext = bytearray()
        for chunk in content.chunks():
            if len(plaintext) + len(chunk) > max_upload():
                raise ValueError("file_too_large")
            plaintext.extend(chunk)
        token = cipher().encrypt(bytes(plaintext))
        path = self.path(name)
        os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=os.path.dirname(path), delete=False) as handle:
                temporary = handle.name
                handle.write(token)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
        finally:
            if temporary and os.path.exists(temporary):
                os.unlink(temporary)
        return name

    def _open(self, name, mode="rb"):
        if mode not in ("r", "rb"):
            raise ValueError("Vault files are read-only")
        with open(self.path(name), "rb") as handle:
            # Token expansion is bounded, so a tampered file cannot cause an unbounded allocation.
            token = handle.read((max_upload() * 4 // 3) + 4097)
            if handle.read(1):
                raise ValueError("Oversized vault ciphertext")
        return ContentFile(cipher().decrypt(token), name=name)

    def url(self, name):
        raise NotImplementedError("Vault files have no public URL")
