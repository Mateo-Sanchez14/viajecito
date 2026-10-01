import json
from datetime import UTC, datetime, timedelta
from io import StringIO

import httpx
import pytest
import respx
import time_machine
from django.core.management import call_command

from crews.models import Crew, CrewMembership, WhatsAppGroupLink
from identity.models import Person, WhatsAppIdentity
from messaging.models import InboundMessage, JobLock, OutboundMessage

BASE = "http://gowa.test"
CHAT = "120363000000000000@g.us"
NOW = datetime(2025, 10, 15, 12, 0, tzinfo=UTC)
SENT = {"code": "SUCCESS", "results": {"message_id": "WA-T-1", "status": "sent"}}


@pytest.fixture(autouse=True)
def frozen_now():
    with time_machine.travel(NOW, tick=False):
        yield


@pytest.fixture
def gowa():
    with respx.mock(assert_all_called=False) as router:
        router.send = router.post(f"{BASE}/send/message").mock(
            return_value=httpx.Response(200, json=SENT)
        )
        router.roster = router.get(f"{BASE}/group/participants").mock(
            return_value=httpx.Response(200, json={"results": {"participants": []}})
        )
        yield router


@pytest.fixture
def ana(crew):
    person = Person.objects.create_user("+5491100000001", display_name="Ana")
    CrewMembership.objects.create(crew=crew, person=person, source="invite")
    WhatsAppIdentity.objects.create(person=person, jid="5491100000001@s.whatsapp.net")
    return person


def tick() -> dict | None:
    out = StringIO()
    call_command("tick", stdout=out)
    text = out.getvalue()
    return json.loads(text) if text.strip() else None


def inbound(body="/viaje ping", **fields) -> InboundMessage:
    defaults = {
        "device_id": "dev",
        "gowa_message_id": f"M{InboundMessage.objects.count() + 1}",
        "event": "message",
        "chat_id": CHAT,
        "sender_jid": "5491100000001@s.whatsapp.net",
        "body": body,
        "raw": {},
    }
    return InboundMessage.objects.create(**{**defaults, **fields})


def queued_outbound(age_seconds=120, **fields) -> OutboundMessage:
    row = OutboundMessage.objects.create(
        **{"to_jid": CHAT, "kind": "reminder", "body": "hola", **fields}
    )
    OutboundMessage.objects.filter(pk=row.pk).update(
        created_at=NOW - timedelta(seconds=age_seconds)
    )
    return row


@pytest.mark.django_db
def test_prints_a_one_line_json_summary(crew, gowa):
    WhatsAppGroupLink.objects.filter(crew=crew).update(last_synced_at=NOW)
    summary = tick()
    assert summary == {
        "requeued": 0,
        "swept_failed": 0,
        "processed": 0,
        "dispatched": 0,
        "dispatch_failed": 0,
        "rosters_synced": 0,
        "errors": 0,
    }


@pytest.mark.django_db
def test_held_lock_exits_silently_and_does_nothing(crew, ana, gowa):
    JobLock.objects.create(name="tick", locked_until=NOW + timedelta(seconds=60), locked_by="other")
    row = inbound()
    queued_outbound()
    assert tick() is None
    row.refresh_from_db()
    assert row.status == "received" and gowa.calls.call_count == 0
    assert OutboundMessage.objects.get().status == "queued"
    assert JobLock.objects.get().locked_by == "other"  # untouched


@pytest.mark.django_db
def test_expired_lock_is_taken_and_released_afterwards(crew, gowa):
    JobLock.objects.create(name="tick", locked_until=NOW - timedelta(seconds=1), locked_by="dead")
    assert tick() is not None
    lock = JobLock.objects.get()
    assert lock.locked_until <= NOW  # released, so the next minute's tick can run


@pytest.mark.django_db
def test_second_tick_while_the_first_holds_the_lock_does_nothing(crew, ana, gowa, monkeypatch):
    row = inbound()
    results: list[dict | None] = []
    from messaging.adapters import tick_wiring

    original = tick_wiring.process_one

    def reentrant(inbound_id: int) -> str:
        results.append(tick())  # a concurrent tick while this one holds the lock
        return original(inbound_id)

    monkeypatch.setattr(tick_wiring, "process_one", reentrant)
    first = tick()
    assert results == [None]
    assert first["processed"] == 1
    row.refresh_from_db()
    assert row.status == "done" and row.attempts == 1


@pytest.mark.django_db
def test_received_rows_are_processed(crew, ana, gowa):
    row = inbound()
    summary = tick()
    row.refresh_from_db()
    assert (row.status, summary["processed"]) == ("done", 1)
    assert OutboundMessage.objects.get().body == "pong"


@pytest.mark.django_db
def test_stuck_processing_rows_return_to_received_and_are_reprocessed(crew, ana, gowa):
    stuck = inbound(status="processing", attempts=1, claimed_at=NOW - timedelta(minutes=3))
    fresh = inbound(status="processing", attempts=1, claimed_at=NOW - timedelta(seconds=30))
    summary = tick()
    stuck.refresh_from_db()
    fresh.refresh_from_db()
    assert (stuck.status, stuck.attempts) == ("done", 2)
    assert (fresh.status, fresh.attempts) == ("processing", 1)
    assert (summary["requeued"], summary["processed"]) == (1, 1)


@pytest.mark.django_db
def test_stuck_rows_out_of_attempts_fail(crew, ana, gowa):
    row = inbound(status="processing", attempts=3, claimed_at=NOW - timedelta(minutes=10))
    summary = tick()
    row.refresh_from_db()
    assert row.status == "failed" and "attempts" in row.error
    assert (summary["swept_failed"], summary["processed"]) == (1, 0)
    assert gowa.send.call_count == 0


@pytest.mark.django_db
def test_stuck_threshold_follows_the_setting(crew, ana, gowa, settings):
    settings.INBOUND_STUCK_MINUTES = 10
    row = inbound(status="processing", attempts=1, claimed_at=NOW - timedelta(minutes=3))
    tick()
    row.refresh_from_db()
    assert row.status == "processing"


@pytest.mark.django_db
def test_queued_outbound_is_dispatched(crew, gowa):
    row = queued_outbound(reply_to_message_id="ORIG")
    summary = tick()
    row.refresh_from_db()
    assert (row.status, row.gowa_message_id, row.attempts) == ("sent", "WA-T-1", 1)
    assert summary["dispatched"] == 1
    assert json.loads(gowa.send.calls.last.request.content) == {
        "phone": CHAT,
        "message": "hola",
        "reply_message_id": "ORIG",
    }


@pytest.mark.django_db
def test_fresh_exhausted_and_redacted_outbound_are_not_resent(crew, gowa):
    fresh = queued_outbound(age_seconds=10)
    exhausted = queued_outbound(attempts=3)
    otp = queued_outbound(kind="otp", body="<redacted>")
    summary = tick()
    for row in (fresh, exhausted, otp):
        row.refresh_from_db()
    assert fresh.status == "queued" and exhausted.status == "queued"
    assert otp.status == "failed" and "redacted" in otp.error
    assert gowa.send.call_count == 0
    assert summary["dispatched"] == 0


@pytest.mark.django_db
def test_dispatch_failure_is_recorded_and_counted(crew, gowa):
    gowa.send.mock(return_value=httpx.Response(500))
    row = queued_outbound()
    summary = tick()
    row.refresh_from_db()
    assert row.status == "failed" and summary["dispatch_failed"] == 1 and summary["errors"] == 0


@pytest.mark.django_db
def test_stale_rosters_are_synced_and_fresh_ones_are_not(crew, gowa):
    fresh = Crew.objects.create(name="Fresh")
    WhatsAppGroupLink.objects.create(
        crew=fresh, chat_id="120363000000000002@g.us", last_synced_at=NOW - timedelta(hours=2)
    )
    summary = tick()  # ``crew`` was never synced
    crew.whatsapp_group.refresh_from_db()
    fresh.whatsapp_group.refresh_from_db()
    assert crew.whatsapp_group.last_synced_at == NOW
    assert fresh.whatsapp_group.last_synced_at == NOW - timedelta(hours=2)
    assert summary["rosters_synced"] == 1 and gowa.roster.call_count == 1


@pytest.mark.django_db
def test_roster_staleness_follows_the_setting(crew, gowa, settings):
    settings.ROSTER_SYNC_HOURS = 1
    WhatsAppGroupLink.objects.filter(crew=crew).update(last_synced_at=NOW - timedelta(hours=2))
    assert tick()["rosters_synced"] == 1


@pytest.mark.django_db
def test_roster_failure_is_counted_and_retried_next_tick(crew, gowa):
    gowa.roster.mock(return_value=httpx.Response(502))
    summary = tick()
    crew.whatsapp_group.refresh_from_db()
    assert crew.whatsapp_group.last_synced_at is None
    assert (summary["errors"], summary["rosters_synced"]) == (1, 0)


@pytest.mark.django_db
def test_tick_is_idempotent(crew, ana, gowa):
    inbound()
    queued_outbound()
    tick()
    second = tick()
    assert second["processed"] == 0 and second["dispatched"] == 0 and second["rosters_synced"] == 0
    assert gowa.send.call_count == 2  # the pong reply and the queued reminder, once each
