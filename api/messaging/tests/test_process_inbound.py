import json

import httpx
import pytest
import respx

from crews.models import CrewMembership
from identity.models import Person, WhatsAppIdentity
from messaging.adapters import wiring
from messaging.adapters.inbound_store import DjangoInboundStore
from messaging.copy import es_ar
from messaging.gowa.parser import parse_message_event
from messaging.models import InboundMessage, OutboundMessage
from messaging.tests.gowa_fixtures import load

BASE = "http://gowa.test"
SENT = {"code": "SUCCESS", "results": {"message_id": "WA-OUT-1", "status": "sent"}}
CHAT = "120363000000000000@g.us"


@pytest.fixture
def ana(crew):
    person = Person.objects.create_user("+5491100000001", display_name="Ana")
    CrewMembership.objects.create(crew=crew, person=person, source="invite")
    WhatsAppIdentity.objects.create(
        person=person, jid="5491100000001@s.whatsapp.net", lid="251556000000001@lid"
    )
    return person


@pytest.fixture
def gowa():
    with respx.mock(assert_all_called=False) as router:
        router.send = router.post(f"{BASE}/send/message").mock(
            return_value=httpx.Response(200, json=SENT)
        )
        router.roster = router.get(f"{BASE}/group/participants").mock(
            return_value=httpx.Response(
                200,
                json={
                    "results": {
                        "participants": [
                            {
                                "jid": "251556000000002@lid",
                                "phone_number": "5491100000002@s.whatsapp.net",
                                "lid": "251556000000002@lid",
                                "display_name": "Beto",
                            }
                        ]
                    }
                },
            )
        )
        yield router


def inbound(fixture: str) -> int:
    payload = load(fixture)
    row_id, created = DjangoInboundStore().get_or_create(parse_message_event(payload), payload)
    assert created
    return row_id


def sent_payloads(gowa) -> list[dict]:
    return [json.loads(call.request.content) for call in gowa.send.calls]


@pytest.mark.django_db
def test_ping_from_a_known_sender_replies_pong_in_the_group(crew, ana, gowa):
    row_id = inbound("group_command_ping.json")
    wiring.run_process_inbound(row_id)
    row = InboundMessage.objects.get(pk=row_id)
    assert (row.status, row.attempts, row.person_id) == ("done", 1, ana.pk)
    assert row.processed_at is not None and row.error == ""
    assert row.outcome["handler"] == "commands" and row.outcome["command"] == "ping"
    reply = OutboundMessage.objects.get()
    assert (reply.kind, reply.to_jid, reply.body) == ("reply", CHAT, "pong")
    assert reply.reply_to_message_id == "3EB0AAAA0000000002"
    assert (reply.subject_type, reply.subject_id) == ("inbound_message", str(row_id))
    assert reply.status == "sent"
    assert sent_payloads(gowa) == [
        {"phone": CHAT, "message": "pong", "reply_message_id": "3EB0AAAA0000000002"}
    ]
    assert gowa.roster.call_count == 0


@pytest.mark.django_db
def test_sender_known_only_by_lid_is_resolved(crew, ana, gowa):
    WhatsAppIdentity.objects.filter(person=ana).update(lid="251556000000002@lid")
    row_id = inbound("group_from_lid.json")
    wiring.run_process_inbound(row_id)
    row = InboundMessage.objects.get(pk=row_id)
    assert (row.status, row.person_id) == ("done", ana.pk)
    assert OutboundMessage.objects.get().body == es_ar.HELP


@pytest.mark.django_db
def test_unknown_sender_triggers_one_roster_sync_then_resolves(crew, gowa):
    row_id = inbound("group_from_lid.json")  # sender 251556000000002@lid is Beto in the roster
    wiring.run_process_inbound(row_id)
    assert gowa.roster.call_count == 1
    row = InboundMessage.objects.get(pk=row_id)
    assert row.status == "done"
    assert row.person.phone == "+5491100000002"
    assert OutboundMessage.objects.get().body == es_ar.HELP


@pytest.mark.django_db
def test_still_unknown_after_the_sync_is_ignored(crew, gowa):
    row_id = inbound("group_command_ping.json")  # Ana is not in the mocked roster
    wiring.run_process_inbound(row_id)
    row = InboundMessage.objects.get(pk=row_id)
    assert (row.status, row.outcome) == ("ignored", {"reason": "unknown_sender"})
    assert row.person is None and gowa.roster.call_count == 1
    assert OutboundMessage.objects.count() == 0


@pytest.mark.django_db
def test_roster_sync_failure_requeues_the_row_while_attempts_remain(crew, gowa):
    gowa.roster.mock(return_value=httpx.Response(502))
    row_id = inbound("group_command_ping.json")
    wiring.run_process_inbound(row_id)
    row = InboundMessage.objects.get(pk=row_id)
    assert (row.status, row.attempts, row.processed_at) == ("received", 1, None)


@pytest.mark.django_db
def test_roster_sync_failure_on_the_last_attempt_is_ignored(crew, gowa):
    gowa.roster.mock(return_value=httpx.Response(502))
    row_id = inbound("group_command_ping.json")
    InboundMessage.objects.filter(pk=row_id).update(attempts=2)
    wiring.run_process_inbound(row_id)
    row = InboundMessage.objects.get(pk=row_id)
    assert (row.status, row.outcome) == ("ignored", {"reason": "roster_unavailable"})


@pytest.mark.django_db
def test_removed_member_still_in_the_group_is_not_handled(crew, ana, gowa):
    CrewMembership.objects.filter(person=ana).update(status="removed")
    row_id = inbound("group_command_ping.json")
    wiring.run_process_inbound(row_id)
    row = InboundMessage.objects.get(pk=row_id)
    assert (row.status, row.outcome) == ("ignored", {"reason": "not_a_member"})
    assert gowa.send.call_count == 0


@pytest.mark.django_db
def test_member_of_another_crew_is_not_handled_here(crew, ana, gowa):
    from crews.models import Crew

    CrewMembership.objects.filter(person=ana).delete()
    other = Crew.objects.create(name="Otra")
    CrewMembership.objects.create(crew=other, person=ana, source="invite")
    row_id = inbound("group_command_ping.json")
    wiring.run_process_inbound(row_id)
    assert InboundMessage.objects.get(pk=row_id).outcome == {"reason": "not_a_member"}
    assert gowa.send.call_count == 0


@pytest.mark.django_db
def test_on_demand_sync_is_skipped_when_the_roster_is_fresh(crew, gowa):
    from datetime import timedelta

    from django.utils import timezone

    link = crew.whatsapp_group
    link.last_synced_at = timezone.now() - timedelta(seconds=60)
    link.save()
    row_id = inbound("group_command_ping.json")
    wiring.run_process_inbound(row_id)
    assert gowa.roster.call_count == 0
    assert InboundMessage.objects.get(pk=row_id).outcome == {"reason": "unknown_sender"}


@pytest.mark.django_db
def test_on_demand_sync_runs_again_once_the_interval_passed(crew, gowa, settings):
    from datetime import timedelta

    from django.utils import timezone

    settings.ROSTER_SYNC_MIN_INTERVAL_SECONDS = 30
    link = crew.whatsapp_group
    link.last_synced_at = timezone.now() - timedelta(seconds=60)
    link.save()
    wiring.run_process_inbound(inbound("group_command_ping.json"))
    assert gowa.roster.call_count == 1


@pytest.mark.django_db
def test_plain_text_has_no_handler(crew, ana, gowa):
    row_id = inbound("group_text.json")
    wiring.run_process_inbound(row_id)
    row = InboundMessage.objects.get(pk=row_id)
    assert (row.status, row.outcome) == ("done", {"reason": "no_handler"})
    assert OutboundMessage.objects.count() == 0 and gowa.send.call_count == 0


@pytest.mark.django_db
def test_unknown_command_gets_the_hint(crew, ana, gowa):
    row_id = inbound("group_command_ping.json")
    InboundMessage.objects.filter(pk=row_id).update(body="/viaje bailar")
    wiring.run_process_inbound(row_id)
    assert OutboundMessage.objects.get().body == es_ar.UNKNOWN_COMMAND


@pytest.mark.django_db
def test_handler_exception_is_recorded_not_raised(crew, ana, gowa, monkeypatch):
    def boom(ctx):
        raise RuntimeError("kaput")

    monkeypatch.setattr("messaging.router.DEFAULT_HANDLERS", [boom])
    row_id = inbound("group_command_ping.json")
    wiring.run_process_inbound(row_id)
    row = InboundMessage.objects.get(pk=row_id)
    assert row.status == "failed" and "kaput" in row.error and row.attempts == 1


@pytest.mark.django_db
def test_rows_that_are_not_received_are_not_processed_again(crew, ana, gowa):
    row_id = inbound("group_command_ping.json")
    wiring.run_process_inbound(row_id)
    wiring.run_process_inbound(row_id)
    assert gowa.send.call_count == 1
    assert InboundMessage.objects.get(pk=row_id).attempts == 1


@pytest.mark.django_db
def test_reprocessing_a_swept_row_does_not_reply_twice(crew, ana, gowa):
    row_id = inbound("group_command_ping.json")
    wiring.run_process_inbound(row_id)
    InboundMessage.objects.filter(pk=row_id).update(status="received")
    wiring.run_process_inbound(row_id)
    assert gowa.send.call_count == 1 and OutboundMessage.objects.count() == 1
    assert InboundMessage.objects.get(pk=row_id).attempts == 2


@pytest.mark.django_db
def test_failed_reply_is_recorded_on_the_ledger_and_the_row_stays_done(crew, ana, gowa):
    gowa.send.mock(return_value=httpx.Response(500))
    row_id = inbound("group_command_ping.json")
    wiring.run_process_inbound(row_id)
    assert InboundMessage.objects.get(pk=row_id).status == "done"
    assert InboundMessage.objects.get(pk=row_id).outcome["reply"] == "failed"
    assert OutboundMessage.objects.get().status == "failed"


@pytest.mark.django_db
def test_webhook_to_reply_end_to_end(client, crew, ana, gowa, settings):
    from messaging.tests.conftest import post_signed

    settings.MESSAGING_PROCESS_SYNC = True
    response = post_signed(client, load("group_command_ping.json"))
    assert response.json() == {"status": "accepted"}
    assert InboundMessage.objects.get().status == "done"
    assert sent_payloads(gowa)[0]["message"] == "pong"


@pytest.mark.django_db
def test_executor_scheduler_defers_until_commit_and_runs_in_a_pool(
    crew, django_capture_on_commit_callbacks, monkeypatch
):
    from messaging.adapters import scheduler

    ran: list[int] = []

    class InlinePool:
        def submit(self, fn, *args):
            fn(*args)

    monkeypatch.setattr(scheduler, "_executor", InlinePool())
    sched = scheduler.ExecutorProcessScheduler(ran.append, synchronous=False)
    with django_capture_on_commit_callbacks(execute=True) as callbacks:
        sched.schedule(5)
        assert ran == []  # nothing before the commit
    assert len(callbacks) == 1 and ran == [5]
