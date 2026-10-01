import hashlib
import hmac
from pathlib import Path

import httpx
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

DEFAULT_URL = "http://localhost:8000/hooks/waha/"


class Command(BaseCommand):
    help = "Sign a WAHA webhook fixture (HMAC-SHA512) with WAHA_WEBHOOK_HMAC_KEY and POST it."

    def add_arguments(self, parser):
        parser.add_argument("fixture", help="path of a JSON payload, sent byte for byte")
        parser.add_argument("--url", default=DEFAULT_URL, help="webhook URL")

    def handle(self, *args, **options):
        key = settings.WAHA_WEBHOOK_HMAC_KEY
        if not key:
            raise CommandError("WAHA_WEBHOOK_HMAC_KEY is empty; set it to sign the request")
        path = Path(options["fixture"])
        try:
            body = path.read_bytes()
        except OSError as exc:
            raise CommandError(f"cannot read {path}: {exc.strerror}") from exc
        signature = hmac.new(key.encode(), body, hashlib.sha512).hexdigest()
        try:
            response = httpx.post(
                options["url"],
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Webhook-Hmac": signature,
                    "X-Webhook-Hmac-Algorithm": "sha512",
                },
                timeout=10,
            )
        except httpx.HTTPError as exc:
            raise CommandError(f"request failed: {exc.__class__.__name__}: {exc}") from exc
        self.stdout.write(f"{response.status_code}")
        self.stdout.write(response.text)
