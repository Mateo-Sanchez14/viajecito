"""A reminder subject preserves every task id independently of message-body limits."""

from uuid import uuid4

import pytest
from django.db import models

from messaging.models import OutboundMessage


@pytest.mark.django_db
def test_task_batch_subject_validates_and_round_trips_more_than_six_uuids():
    subject = ",".join(str(uuid4()) for _ in range(20))
    assert len(subject) > 255
    message = OutboundMessage(
        to_jid="120363000000000000@g.us",
        kind="reminder",
        body="Task reminder",
        subject_type="task_batch",
        subject_id=subject,
    )
    message.full_clean()
    message.save()
    message.refresh_from_db()
    assert message.subject_id == subject
    field = OutboundMessage._meta.get_field("subject_id")
    assert isinstance(field, models.TextField)
    assert field.max_length is None and not field.db_index
