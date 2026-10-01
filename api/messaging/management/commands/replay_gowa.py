import hashlib
import hmac
from pathlib import Path

import httpx
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

DEFAULT_URL = "http://localhost:8000/hooks/gowa/"


class Command(BaseCommand):
    help = "Sign a Gowa webhook fixture with GOWA_WEBHOOK_SECRET and POST it to the webhook."

    def add_arguments(self, parser):
        parser.add_argument("fixture", help="path of a JSON payload, sent byte for byte")
        parser.add_argument("--url", default=DEFAULT_URL, help="webhook URL")

    def handle(self, *args, **options):
        secret = settings.GOWA_WEBHOOK_SECRET
        if not secret:
            raise CommandError("GOWA_WEBHOOK_SECRET is empty; set it to sign the request")
        path = Path(options["fixture"])
        try:
            body = path.read_bytes()
        except OSError as exc:
            raise CommandError(f"cannot read {path}: {exc.strerror}") from exc
        signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        try:
            response = httpx.post(
                options["url"],
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Hub-Signature-256": f"sha256={signature}",
                },
                timeout=10,
            )
        except httpx.HTTPError as exc:
            raise CommandError(f"request failed: {exc.__class__.__name__}: {exc}") from exc
        self.stdout.write(f"{response.status_code}")
        self.stdout.write(response.text)
