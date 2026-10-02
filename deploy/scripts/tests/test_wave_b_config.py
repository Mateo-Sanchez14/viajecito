"""Offline Wave B env and literal rotation-key regressions (no Docker or network)."""

import base64
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

from cryptography.fernet import Fernet, MultiFernet

ROOT = Path(__file__).resolve().parents[3]
EXAMPLES = (ROOT / ".env.example", ROOT / "deploy/env/api.env.example")
DEFAULTS = {
    "LOGISTICS_NAG_LEAD_DAYS": "3",
    "DOCUMENTS_MAX_UPLOAD_BYTES": "15728640",
    "DOCUMENTS_TRIP_QUOTA_BYTES": "1073741824",
    "FILE_UPLOAD_MAX_MEMORY_SIZE": "2621440",
    "DATA_UPLOAD_MAX_MEMORY_SIZE": "2621440",
}
MIME = (
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
)


def values(path):
    return [
        line.split("=", 1)
        for line in path.read_text().splitlines()
        if line and not line.startswith("#")
    ]


class WaveBConfigurationTests(unittest.TestCase):
    def test_examples_document_defaults_without_duplicate_keys(self):
        for path in EXAMPLES:
            pairs = values(path)
            settings = dict(pairs)
            with self.subTest(path=path):
                self.assertEqual(len(pairs), len(settings))
                for key, expected in DEFAULTS.items():
                    self.assertEqual(settings.get(key), expected, key)
                for mime in MIME:
                    self.assertIn(mime, path.read_text())
                self.assertNotIn("DOCUMENTS_ALLOWED_MIME", settings)

    def test_dev_key_is_stable_public_sample_and_prod_requires_fresh_key(self):
        key = dict(values(EXAMPLES[0])).get("DOCUMENTS_FERNET_KEYS", "")
        self.assertRegex(key, r"^[A-Za-z0-9_-]{43}=$")
        self.assertEqual(len(base64.urlsafe_b64decode(key)), 32)
        cipher = Fernet(key.encode())
        self.assertEqual(cipher.decrypt(cipher.encrypt(b"sample")), b"sample")
        self.assertEqual(dict(values(EXAMPLES[1])).get("DOCUMENTS_FERNET_KEYS"), "")
        self.assertIn("development only", EXAMPLES[0].read_text())
        self.assertIn("urlsafe_b64encode", EXAMPLES[1].read_text())

    def test_rotation_guidance_scopes_comma_exception_to_keys(self):
        text = (ROOT / "deploy/README.md").read_text()
        self.assertIn("DOCUMENTS_FERNET_KEYS", text)
        self.assertIn("new,old", text)
        self.assertIn("first key encrypts", text)
        self.assertIn("backups", text)
        self.assertIn("no spaces or quotes", text)
        # All other active production values retain the existing restricted alphabet.
        for key, value in values(EXAMPLES[1]):
            if key != "DOCUMENTS_FERNET_KEYS":
                self.assertTrue(re.fullmatch(r"[A-Za-z0-9._~+/=:-]*", value), key)

    def test_literal_loader_preserves_rotation_order_without_expansion(self):
        new = base64.urlsafe_b64encode(b"n" * 32).decode()
        old = base64.urlsafe_b64encode(b"o" * 32).decode()
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / "api.env"
            marker = Path(directory) / "executed"
            env.write_text(
                f"DOCUMENTS_FERNET_KEYS={new},{old}\nUNTRUSTED=$(touch {marker})\n"
            )
            result = subprocess.run(
                [
                    "bash",
                    "-c",
                    'source "$1"; load_env "$2"; printf "%s" "$DOCUMENTS_FERNET_KEYS"',
                    "test",
                    str(ROOT / "deploy/scripts/lib.sh"),
                    str(env),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.stdout, f"{new},{old}")
            self.assertFalse(marker.exists())
            new_cipher, old_cipher = [
                Fernet(key.encode()) for key in result.stdout.split(",")
            ]
            rotating = MultiFernet([new_cipher, old_cipher])
            self.assertEqual(
                rotating.decrypt(old_cipher.encrypt(b"existing")), b"existing"
            )
            self.assertEqual(
                new_cipher.decrypt(rotating.encrypt(b"new upload")), b"new upload"
            )


if __name__ == "__main__":
    unittest.main()
