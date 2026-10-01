import json
from datetime import UTC, date, datetime
from io import StringIO

import httpx
import pytest
import respx
import time_machine
from django.core.management import call_command

from crews.models import WhatsAppGroupLink
from messaging import reminders
from messaging.models import OutboundMessage
from messaging.reminders import ReminderDraft
from notifications import ports
from notifications.adapters import wiring
from notifications.copy.es_ar import ALGUIEN, COUNTDOWN_BODY, COUNTDOWN_TITLE
from notifications.models import NotificationPreference, PushDelivery, PushSubscription
from notifications.tests.conftest import AUTH, P256DH
from trips.models import Trip

pytestmark = pytest.mark.django_db


def run_tick() -> dict:
    out = StringIO()
    call_command("tick", stdout=out)
    return json.loads(out.getvalue())


def subscribe(person, n=1, host="fcm.googleapis.com", **extra) -> PushSubscription:
    return PushSubscription.objects.create(
        person=person,
        endpoint=f"https://{host}/fcm/send/{person.display_name}-{n}",
        p256dh=P256DH,
        auth=AUTH,
        **extra,
    )


def make_draft(trip, **overrides) -> ReminderDraft:
    fields = {
        "crew_id": str(trip.crew_id),
        "trip_id": str(trip.pk),
        "body": "Faltan cosas",
        "dedupe_key": "logistics:nag:t1:2026-10-01",
        "timezone": "UTC",
        "title": "Tareas",
        "url_path": f"/crews/{trip.crew_id}/trips/{trip.pk}/logistics",
    }
    return ReminderDraft(**{**fields, **overrides})


def sent_to(sender) -> list[str]:
    return [sub.endpoint.rsplit("/", 1)[1] for sub, _ in sender.sent]


def deliveries() -> dict[str, tuple[str, int]]:
    return {
        d.person.display_name: (d.status, d.subscriptions_ok)
        for d in PushDelivery.objects.select_related("person")
    }


def test_without_mentions_every_in_or_maybe_participant_gets_it(sender, trip, ana, beto, caro):
    for person in (ana, beto, caro):
        subscribe(person)
    wiring.push_channel(make_draft(trip))
    assert sorted(sent_to(sender)) == ["Ana-1", "Beto-1"]  # caro is rsvp=out
    _, payload = sender.sent[0]
    assert payload["title"] == "Tareas"
    assert payload["body"] == "Faltan cosas"
    assert payload["url"].endswith("/logistics")
    assert deliveries() == {"Ana": ("sent", 1), "Beto": ("sent", 1)}


def test_mentions_narrow_the_recipients_even_to_people_who_are_out(sender, trip, ana, beto, caro):
    for person in (ana, beto, caro):
        subscribe(person)
    wiring.push_channel(make_draft(trip, mention_person_ids=(str(caro.pk),)))
    assert sent_to(sender) == ["Caro-1"]


def test_mention_tokens_in_the_body_become_names(sender, trip, ana, beto):
    subscribe(beto)
    body = f"{{@{ana.pk}}} te toca reservar"
    wiring.push_channel(make_draft(trip, body=body, mention_person_ids=(str(beto.pk),)))
    assert sender.sent[0][1]["body"] == "Ana te toca reservar"


def test_every_subscription_of_a_person_gets_the_push(sender, trip, ana):
    subscribe(ana, 1)
    subscribe(ana, 2, host="updates.push.services.mozilla.com")
    wiring.push_channel(make_draft(trip))
    assert sorted(sent_to(sender)) == ["Ana-1", "Ana-2"]
    assert deliveries() == {"Ana": ("sent", 2)}


def test_people_without_subscriptions_leave_no_ledger_row(sender, trip, ana):
    wiring.push_channel(make_draft(trip))
    assert sender.sent == []
    assert not PushDelivery.objects.exists()


def test_the_same_reminder_is_never_delivered_twice(sender, trip, ana):
    subscribe(ana)
    draft = make_draft(trip)
    wiring.push_channel(draft)
    wiring.push_channel(draft)
    assert len(sender.sent) == 1
    assert PushDelivery.objects.count() == 1


@pytest.mark.parametrize("category", ["reminders", "all"])
def test_a_disabled_category_or_all_is_skipped_and_recorded(sender, trip, ana, category):
    subscribe(ana)
    NotificationPreference.objects.create(person=ana, category=category, enabled=False)
    wiring.push_channel(make_draft(trip))
    assert sender.sent == []
    assert deliveries() == {"Ana": ("skipped", 0)}


def test_a_preference_only_affects_its_own_category(sender, trip, ana):
    subscribe(ana)
    NotificationPreference.objects.create(person=ana, category="countdown", enabled=False)
    wiring.push_channel(make_draft(trip))  # a task reminder
    assert sent_to(sender) == ["Ana-1"]
    wiring.push_channel(make_draft(trip, dedupe_key="notifications:countdown:t:T-7"))
    assert sent_to(sender) == ["Ana-1"]
    statuses = dict(PushDelivery.objects.values_list("dedupe_key", "status"))
    assert statuses == {
        "logistics:nag:t1:2026-10-01": "sent",
        "notifications:countdown:t:T-7": "skipped",
    }


def test_a_410_removes_the_subscription(sender, trip, ana):
    dead = subscribe(ana, 1)
    alive = subscribe(ana, 2)
    sender.outcomes[dead.endpoint] = "gone"
    wiring.push_channel(make_draft(trip))
    assert list(PushSubscription.objects.all()) == [alive]
    assert deliveries() == {"Ana": ("sent", 1)}


def test_a_404_removes_the_subscription_too(sender, trip, ana):
    dead = subscribe(ana)
    sender.outcomes[dead.endpoint] = "gone"
    wiring.push_channel(make_draft(trip))
    assert not PushSubscription.objects.exists()
    assert deliveries() == {"Ana": ("failed", 0)}


def test_other_failures_count_and_five_in_a_row_remove_the_subscription(sender, trip, ana):
    sub = subscribe(ana)
    sender.outcomes[sub.endpoint] = "error"
    for n in range(1, 5):
        wiring.push_channel(make_draft(trip, dedupe_key=f"logistics:nag:t1:{n}"))
        sub.refresh_from_db()
        assert sub.failure_count == n
        assert sub.last_error_at is not None
    wiring.push_channel(make_draft(trip, dedupe_key="logistics:nag:t1:5"))
    assert not PushSubscription.objects.exists()


def test_a_success_resets_the_failure_count(sender, trip, ana):
    sub = subscribe(ana, failure_count=4)
    wiring.push_channel(make_draft(trip))
    sub.refresh_from_db()
    assert sub.failure_count == 0
    assert sub.last_ok_at is not None


def test_a_crashing_sender_never_propagates_and_keeps_the_subscription(sender, trip, ana, beto):
    subscribe(ana)
    subscribe(beto)
    sender.raises = RuntimeError("boom")
    wiring.push_channel(make_draft(trip))  # must not raise
    assert PushSubscription.objects.count() == 2
    assert deliveries() == {"Ana": ("failed", 0), "Beto": ("failed", 0)}


def test_one_persons_failure_does_not_stop_the_next(sender, trip, ana, beto, monkeypatch):
    subscribe(ana)
    subscribe(beto)
    from notifications.adapters.django_store import DjangoSubscriptionStore

    original = DjangoSubscriptionStore.list_for_person

    def flaky(self, person_id):
        if person_id == str(ana.pk):
            raise RuntimeError("db hiccup")
        return original(self, person_id)

    monkeypatch.setattr(DjangoSubscriptionStore, "list_for_person", flaky)
    wiring.push_channel(make_draft(trip))
    assert sent_to(sender) == ["Beto-1"]


def test_the_channel_does_nothing_when_vapid_is_not_configured(settings, trip, ana, sender):
    settings.NOTIFICATIONS_VAPID_PRIVATE_KEY = ""
    subscribe(ana)
    wiring.push_channel(make_draft(trip))
    assert sender.sent == []
    assert not PushDelivery.objects.exists()


def test_at_most_twenty_sends_per_reminder(sender, trip, ana):
    for n in range(25):
        subscribe(ana, n)
    wiring.push_channel(make_draft(trip))
    assert len(sender.sent) == 20


def test_the_time_budget_stops_further_sends(sender, trip, ana, beto):
    subscribe(ana)
    subscribe(beto)
    clock = iter([0.0, 1.0, 100.0, 100.0, 100.0])  # budget start, ana ok, then past the budget
    services = wiring.push_services()
    services = services.__class__(**{**vars(services), "monotonic": lambda: next(clock)})
    from notifications.use_cases.push_delivery import deliver_push

    deliver_push(make_draft(trip), services)
    assert len(sender.sent) == 1


def test_a_disallowed_endpoint_is_dropped_without_sending(sender, trip, ana, settings):
    subscribe(ana, host="evil.example")
    wiring.push_channel(make_draft(trip))
    assert sender.sent == []
    assert not PushSubscription.objects.exists()


def test_a_draft_without_a_trip_or_mentions_reaches_nobody(sender, trip, ana):
    subscribe(ana)
    wiring.push_channel(make_draft(trip, trip_id=None))
    assert sender.sent == []


def test_garbage_person_ids_in_mentions_are_ignored(sender, trip, ana):
    subscribe(ana)
    wiring.push_channel(make_draft(trip, mention_person_ids=("not-a-uuid", str(ana.pk))))
    assert sent_to(sender) == ["Ana-1"]


def test_install_registers_the_channel_the_rule_and_the_prune_job():
    wiring.install()
    wiring.install()  # idempotent
    assert ("push", wiring.push_channel) in reminders.registered_channels()
    assert [r.key for r in reminders.registered_rules()] == ["notifications.countdown"]
    assert [key for key, _ in reminders.registered_tick_jobs()] == ["notifications.prune"]


@time_machine.travel(datetime(2026, 10, 1, 15, 0, tzinfo=UTC), tick=False)  # 12:00 in Buenos Aires
def test_a_real_tick_mirrors_the_countdown_to_push_once(sender, trip, ana, crew, settings):
    """End to end through core: the countdown rule queues the group message, the tick runs the
    push channel for that new row only, and the prune job reports its counter."""
    WhatsAppGroupLink.objects.create(
        crew=crew,
        chat_id="120363000000000000@g.us",
        last_synced_at=datetime(2099, 1, 1, tzinfo=UTC),
    )
    Trip.objects.filter(pk=trip.pk).update(start_on=date(2026, 10, 8))
    subscribe(ana)
    settings.GOWA_BASE_URL = "http://gowa.test"
    wiring.install()
    with ports.use_sender(sender), respx.mock(assert_all_called=False) as gowa:
        gowa.post("http://gowa.test/send/message").mock(
            return_value=httpx.Response(
                200, json={"results": {"message_id": "WA1", "status": "sent"}}
            )
        )
        first = run_tick()
        second = run_tick()
    assert first["reminders_queued"] == 1
    assert first["notifications.prune.deleted"] == 0
    assert second["reminders_queued"] == 0
    ((subscription, payload),) = sender.sent
    assert subscription.endpoint.endswith("Ana-1")
    assert payload["title"] == COUNTDOWN_TITLE
    assert payload["body"] == COUNTDOWN_BODY[7].format(trip="Bariloche")
    assert payload["url"] == f"/crews/{crew.pk}/trips/{trip.pk}"
    assert (
        OutboundMessage.objects.filter(dedupe_key=f"notifications:countdown:{trip.pk}:T-7").count()
        == 1
    )


def test_a_nameless_person_in_a_mention_never_leaks_their_phone(sender, trip, beto):
    from identity.models import Person

    ghost = Person.objects.create_user("+5491155557777")  # no display name
    subscribe(beto)
    body = f"{{@{ghost.pk}}} te toca reservar"
    wiring.push_channel(make_draft(trip, body=body, mention_person_ids=(str(beto.pk),)))
    payload_body = sender.sent[0][1]["body"]
    assert payload_body == f"{ALGUIEN} te toca reservar"
    assert "5491155557777" not in json.dumps(sender.sent[0][1])


def test_config_errors_never_touch_subscriptions_and_abort_the_draft(
    sender, trip, ana, beto, caplog
):
    subs = [subscribe(ana), subscribe(beto)]
    sender.outcomes = {s.endpoint: "config_error" for s in subs}
    with caplog.at_level("ERROR"):
        for n in range(8):  # far more than the 5-failure prune threshold
            wiring.push_channel(make_draft(trip, dedupe_key=f"logistics:nag:t1:{n}"))
    assert PushSubscription.objects.count() == 2
    assert all(s.failure_count == 0 for s in PushSubscription.objects.all())
    assert sender.calls == 8  # the first config error aborts the rest of each draft
    assert sum("push configuration error" in r.message for r in caplog.records) == 1


def test_deliver_push_reports_config_errors(sender, trip, ana):
    from notifications.use_cases.push_delivery import deliver_push

    subscribe(ana)
    sender.outcomes = {s.endpoint: "config_error" for s in PushSubscription.objects.all()}
    result = deliver_push(make_draft(trip), wiring.push_services())
    assert result.config_error == 1
    assert result.sent == 0


def test_http_errors_still_count_against_the_subscription(sender, trip, ana):
    sub = subscribe(ana)
    sender.outcomes[sub.endpoint] = "error"
    wiring.push_channel(make_draft(trip))
    sub.refresh_from_db()
    assert sub.failure_count == 1


def test_an_invalid_configuration_disables_the_channel(sender, trip, ana, settings):
    settings.NOTIFICATIONS_VAPID_SUBJECT = "http://localhost:3000"
    subscribe(ana)
    wiring.push_channel(make_draft(trip))
    assert sender.calls == 0
