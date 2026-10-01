import httpx
import pytest
import respx

from crews.models import CrewMembership
from identity.models import Person
from messaging.adapters.crews_gateway import CrewsGateway
from messaging.ports import GatewayError

BASE = "http://gowa.test"
BOT = "5491100000009@s.whatsapp.net"


def body(*participants):
    return {"code": "SUCCESS", "results": {"group_id": "g", "participants": list(participants)}}


@pytest.mark.django_db
@respx.mock
def test_sync_roster_pulls_participants_and_skips_the_bot(crew, settings):
    settings.GOWA_DEVICE_ID = BOT
    respx.get(f"{BASE}/group/participants").mock(
        return_value=httpx.Response(
            200,
            json=body(
                {
                    "jid": "251556000000001@lid",
                    "phone_number": "5491100000001@s.whatsapp.net",
                    "lid": "251556000000001@lid",
                    "display_name": "Ana",
                },
                {"jid": BOT, "phone_number": BOT, "lid": None, "display_name": "bot"},
            ),
        )
    )
    result = CrewsGateway().sync_roster(str(crew.pk))
    assert (result.created, result.skipped) == (1, 0)
    assert list(Person.objects.values_list("phone", flat=True)) == ["+5491100000001"]
    assert CrewMembership.objects.count() == 1


@pytest.mark.django_db
@respx.mock
def test_sync_roster_propagates_gateway_errors_and_stays_stale(crew):
    respx.get(f"{BASE}/group/participants").mock(return_value=httpx.Response(502))
    with pytest.raises(GatewayError):
        CrewsGateway().sync_roster(str(crew.pk))
    crew.whatsapp_group.refresh_from_db()
    assert crew.whatsapp_group.last_synced_at is None


@pytest.mark.django_db
def test_crew_id_for_chat(crew):
    gateway = CrewsGateway()
    assert gateway.crew_id_for_chat("120363000000000000@g.us") == str(crew.pk)
    assert gateway.crew_id_for_chat("120363999999999999@g.us") is None


@pytest.mark.django_db
@respx.mock
def test_a_device_id_that_is_not_a_jid_logs_a_warning(crew, settings, caplog):
    settings.GOWA_DEVICE_ID = "my-device"
    respx.get(f"{BASE}/group/participants").mock(return_value=httpx.Response(200, json=body()))
    with caplog.at_level("WARNING"):
        CrewsGateway().sync_roster(str(crew.pk))
    assert "GOWA_DEVICE_ID" in caplog.text and "JID" in caplog.text


@pytest.mark.django_db
@respx.mock
def test_a_jid_device_id_does_not_warn(crew, settings, caplog):
    settings.GOWA_DEVICE_ID = BOT
    respx.get(f"{BASE}/group/participants").mock(return_value=httpx.Response(200, json=body()))
    with caplog.at_level("WARNING"):
        CrewsGateway().sync_roster(str(crew.pk))
    assert "GOWA_DEVICE_ID" not in caplog.text
