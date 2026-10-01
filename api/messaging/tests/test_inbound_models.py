import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from crews.models import Crew, WhatsAppGroupLink
from messaging.models import InboundMessage, JobLock


def _row(**overrides):
    fields = {
        "device_id": "5491100000009@s.whatsapp.net",
        "gowa_message_id": "MSG1",
        "event": "message",
        "chat_id": "120363000000000000@g.us",
        "raw": {},
    }
    return InboundMessage.objects.create(**{**fields, **overrides})


@pytest.mark.django_db
def test_inbound_message_defaults():
    row = _row()
    assert (row.status, row.attempts, row.outcome, row.error) == ("received", 0, {}, "")
    assert row.person is None and row.processed_at is None and row.received_at is not None


@pytest.mark.django_db
def test_device_and_message_id_are_unique_together():
    _row()
    with pytest.raises(IntegrityError), transaction.atomic():
        _row()
    _row(gowa_message_id="MSG2")
    _row(device_id="other", gowa_message_id="MSG1")
    assert InboundMessage.objects.count() == 3


@pytest.mark.django_db
def test_job_lock_name_is_unique():
    JobLock.objects.create(name="tick", locked_until=timezone.now(), locked_by="a")
    with pytest.raises(IntegrityError), transaction.atomic():
        JobLock.objects.create(name="tick", locked_until=timezone.now(), locked_by="b")


@pytest.mark.django_db
def test_group_link_last_synced_at_is_nullable():
    link = WhatsAppGroupLink.objects.create(
        crew=Crew.objects.create(name="Pibes"), chat_id="120363000000000001@g.us"
    )
    assert link.last_synced_at is None
