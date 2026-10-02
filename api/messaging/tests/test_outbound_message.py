import httpx
import pytest
import respx

from messaging.adapters.ledger import DjangoOutboundLedger
from messaging.gowa.client import GowaClient
from messaging.models import OutboundMessage
from messaging.ports import GatewayError
from messaging.use_cases.send_message import send_message

BASE = "http://gowa.test"
JID = "5491155551234@s.whatsapp.net"
OK = {"code": "SUCCESS", "results": {"message_id": "WA1", "status": "sent"}}


@pytest.fixture
def gateway():
    return GowaClient(BASE, "", "")


@pytest.fixture
def ledger():
    return DjangoOutboundLedger()


@pytest.mark.django_db
@respx.mock
def test_otp_body_is_redacted_in_the_ledger_but_sent_in_full(gateway, ledger):
    route = respx.post(f"{BASE}/send/message").mock(return_value=httpx.Response(200, json=OK))
    send_message(ledger=ledger, gateway=gateway, to_jid=JID, body="Tu código es 123456", kind="otp")
    row = OutboundMessage.objects.get()
    assert row.body == "<redacted>"
    assert b"123456" in route.calls.last.request.content
    assert (row.status, row.gowa_message_id, row.attempts) == ("sent", "WA1", 1)
    assert row.sent_at is not None and row.to_jid == JID and row.kind == "otp"


@pytest.mark.django_db
@respx.mock
def test_non_otp_body_is_stored(gateway, ledger):
    respx.post(f"{BASE}/send/message").mock(return_value=httpx.Response(200, json=OK))
    send_message(ledger=ledger, gateway=gateway, to_jid=JID, body="pong", kind="reply")
    assert OutboundMessage.objects.get().body == "pong"


@pytest.mark.django_db
@respx.mock
def test_gateway_failure_marks_failed_and_does_not_raise(gateway, ledger):
    respx.post(f"{BASE}/send/message").mock(return_value=httpx.Response(502))
    result = send_message(ledger=ledger, gateway=gateway, to_jid=JID, body="x", kind="otp")
    row = OutboundMessage.objects.get()
    assert result.status == "failed"
    assert (row.status, row.attempts) == ("failed", 1)
    assert "502" in row.error and row.gowa_message_id == ""


@pytest.mark.django_db
@respx.mock
def test_dedupe_key_sends_only_once(gateway, ledger):
    route = respx.post(f"{BASE}/send/message").mock(return_value=httpx.Response(200, json=OK))
    for _ in range(2):
        send_message(
            ledger=ledger, gateway=gateway, to_jid=JID, body="hi", kind="reminder", dedupe_key="k1"
        )
    assert route.call_count == 1
    assert OutboundMessage.objects.count() == 1


@pytest.mark.django_db
def test_gateway_error_type_is_what_the_use_case_catches(ledger):
    class Boom:
        def send_text(self, to_jid, body, reply_to=None):
            raise GatewayError("nope")

    assert (
        send_message(ledger=ledger, gateway=Boom(), to_jid=JID, body="x", kind="card").status
        == "failed"
    )


def test_subject_id_is_wide_enough_for_comma_separated_ids():
    assert OutboundMessage._meta.get_field("subject_id").max_length is None
