# Documents vault

Downloads always authorize membership and visibility before decrypting. Identity documents are forced
private. Only the owner changes visibility; owner/uploader can delete. Originals are sanitized for
headers only; UUID storage paths are independent of filenames. MIME is sniffed from signatures and
validated against an allowlist, not trusted client Content-Type. This is type detection, not antivirus.

MultiFernet authenticates the entire bounded document (15 MiB default) before exposing plaintext.
Uploads are read in bounded chunks, encrypted as one token, fsynced to a private temp file and atomically
renamed. Whole-file Fernet instead of a new chunk framing protocol is deliberate: memory use is bounded
but several plaintext/token copies may exist. This format is not suitable for arbitrarily large files.
Keys protect against media theft/disposal only, not host compromise (the process has access to keys).
Ciphertext is not served through `/media`; storage URLs are disabled. Never add a public media route
for vault paths. Download responses are private/no-store, sandboxed, nosniff, and integrity checked.

Set DOCUMENTS_FERNET_KEYS to a comma-separated list of stable Fernet keys. The first encrypts and all
keys decrypt, allowing gradual rotation. `uv run python manage.py generate_vault_key` produces a key;
never commit production keys. Startup enforcement and env parsing are orchestrator-owned. The storage
fails closed when keys are absent. A persistent app-owned quota row serializes reservations/deletions.

Run `uv run pytest documents` and the full suite/import/migration checks before integration.
