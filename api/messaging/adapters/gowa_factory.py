from django.conf import settings

from messaging.gowa.client import GowaClient


def build_gowa_client() -> GowaClient:
    return GowaClient(
        settings.GOWA_BASE_URL,
        settings.GOWA_BASIC_AUTH_USER,
        settings.GOWA_BASIC_AUTH_PASS,
        device_id=settings.GOWA_DEVICE_ID,
    )
