"""Picks the WhatsApp gateway client from ``WHATSAPP_PROVIDER`` (``gowa`` | ``waha``)."""

from django.conf import settings

from messaging.adapters.gowa_factory import build_gowa_client
from messaging.gowa.client import GowaClient
from messaging.waha.client import WahaClient


def build_waha_client() -> WahaClient:
    return WahaClient(settings.WAHA_BASE_URL, settings.WAHA_API_KEY, settings.WAHA_SESSION)


def build_gateway() -> GowaClient | WahaClient:
    """Both clients satisfy ``TextGateway`` and expose ``group_participants``."""
    return build_waha_client() if settings.WHATSAPP_PROVIDER == "waha" else build_gowa_client()
