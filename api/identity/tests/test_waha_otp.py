"""OTP delivery through WAHA when ``WHATSAPP_PROVIDER=waha``."""

import json

import httpx
import pytest
import respx

from identity.adapters.otp_sender import WhatsAppOtpSender
from messaging.models import OutboundMessage

BASE = "http://waha.test"
SENT = {"id": "true_5491155551234@c.us_WAID1", "fromMe": True}


@pytest.fixture(autouse=True)
def waha_settings(settings):
    settings.WHATSAPP_PROVIDER = "waha"
    settings.WAHA_BASE_URL = BASE
    settings.WAHA_API_KEY = "k3y"
    settings.WAHA_SESSION = "default"


@pytest.fixture
def waha():
    with respx.mock(assert_all_called=False) as router:
        router.send = router.post(f"{BASE}/api/sendText").mock(
            return_value=httpx.Response(201, json=SENT)
        )
        yield router


@pytest.mark.django_db
def test_otp_goes_to_the_c_us_dm_and_the_ledger_keeps_the_code_out(waha):
    WhatsAppOtpSender().send_otp("+5491155551234", "482913", 300)
    (body,) = [json.loads(c.request.content) for c in waha.send.calls]
    assert body["chatId"] == "5491155551234@c.us" and "482913" in body["text"]
    assert waha.send.calls.last.request.headers["x-api-key"] == "k3y"
    row = OutboundMessage.objects.get()
    assert (row.kind, row.status, row.gowa_message_id) == ("otp", "sent", SENT["id"])
    assert "482913" not in row.body
