"""Print a new VAPID key pair for Web Push.

    python manage.py generate_vapid_keys

Copy the two lines into the api env file (``NOTIFICATIONS_VAPID_PUBLIC_KEY`` and
``NOTIFICATIONS_VAPID_PRIVATE_KEY``) once and keep the private one secret: it is never served or
logged. Rotating the pair invalidates every existing browser subscription (people must enable
notifications again).
"""

import base64

from cryptography.hazmat.primitives import serialization
from django.core.management.base import BaseCommand
from py_vapid import Vapid


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


class Command(BaseCommand):
    help = "Print a new VAPID key pair (base64url) as NOTIFICATIONS_VAPID_* env lines."

    def handle(self, *args, **options) -> None:
        vapid = Vapid()
        vapid.generate_keys()
        public = vapid.public_key.public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
        self.stdout.write(f"NOTIFICATIONS_VAPID_PUBLIC_KEY={b64url(public)}")
        self.stdout.write(f"NOTIFICATIONS_VAPID_PRIVATE_KEY={b64url(private)}")
