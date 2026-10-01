import pytest

from notifications.models import NotificationPreference, PushDelivery, PushSubscription
from notifications.tests.conftest import AUTH, P256DH, PRIVATE_KEY, PUBLIC_KEY, send, sub_body

pytestmark = pytest.mark.django_db

BASE = "/api/notifications"


def subscribe(person, n=1):
    return PushSubscription.objects.create(
        person=person,
        endpoint=sub_body(n)["endpoint"] + f"-{person.display_name}",
        p256dh=P256DH,
        auth=AUTH,
    )


# --- VAPID public key ---------------------------------------------------------------------


def test_the_vapid_key_needs_a_session(anon, vapid):
    response = send(anon, "get", f"{BASE}/vapid_public_key")
    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


def test_the_vapid_key_is_served_to_members(as_person, ana, vapid):
    response = send(as_person(ana), "get", f"{BASE}/vapid_public_key")
    assert response.status_code == 200
    assert response.json() == {"public_key": PUBLIC_KEY}


def test_the_vapid_key_is_a_503_when_push_is_not_configured(as_person, ana, settings):
    settings.NOTIFICATIONS_VAPID_PUBLIC_KEY = ""
    settings.NOTIFICATIONS_VAPID_PRIVATE_KEY = ""
    response = send(as_person(ana), "get", f"{BASE}/vapid_public_key")
    assert response.status_code == 503
    assert response.json()["code"] == "push_unavailable"


def test_one_missing_half_of_the_key_pair_also_disables_push(as_person, ana, vapid, settings):
    settings.NOTIFICATIONS_VAPID_PRIVATE_KEY = ""
    assert send(as_person(ana), "get", f"{BASE}/vapid_public_key").status_code == 503


def test_the_private_key_never_appears_in_any_response(as_person, ana, sender):
    client = as_person(ana)
    for path in ("/vapid_public_key", "/preferences", "/subscriptions"):
        assert PRIVATE_KEY not in send(client, "get", BASE + path).content.decode()


# --- preferences --------------------------------------------------------------------------


def test_preferences_default_to_everything_enabled(as_person, ana):
    response = send(as_person(ana), "get", f"{BASE}/preferences")
    assert response.status_code == 200
    assert response.json() == {
        "push": {
            "all": True,
            "reminders": True,
            "digest": True,
            "countdown": True,
            "proposals": True,
        }
    }


def test_preferences_require_a_session(anon):
    assert send(anon, "get", f"{BASE}/preferences").status_code == 401
    assert send(anon, "put", f"{BASE}/preferences", {"push": {"digest": False}}).status_code == 401


def test_a_partial_update_changes_only_the_named_categories(as_person, ana):
    client = as_person(ana)
    response = send(client, "put", f"{BASE}/preferences", {"push": {"digest": False}})
    assert response.status_code == 200
    body = response.json()["push"]
    assert body["digest"] is False
    assert body["reminders"] is True
    assert (
        send(client, "put", f"{BASE}/preferences", {"push": {"digest": True}}).json()["push"][
            "digest"
        ]
        is True
    )
    assert (
        NotificationPreference.objects.filter(person=ana).count() == 1
    )  # upserted, not duplicated


def test_preferences_are_per_person(as_person, ana, beto):
    send(as_person(ana), "put", f"{BASE}/preferences", {"push": {"all": False}})
    assert send(as_person(beto), "get", f"{BASE}/preferences").json()["push"]["all"] is True


@pytest.mark.parametrize(
    "payload",
    [{"push": {"bogus": True}}, {"push": {"digest": "yes"}}, {"push": {"digest": 1}}, {"nope": 1}],
)
def test_invalid_preferences_are_rejected(as_person, ana, payload):
    response = send(as_person(ana), "put", f"{BASE}/preferences", payload)
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_request"
    assert not NotificationPreference.objects.exists()


# --- test push ----------------------------------------------------------------------------


def test_the_test_push_needs_a_session(anon, vapid):
    assert send(anon, "post", f"{BASE}/test").status_code == 401


def test_the_test_push_is_a_503_without_vapid(as_person, ana, settings):
    settings.NOTIFICATIONS_VAPID_PUBLIC_KEY = ""
    response = send(as_person(ana), "post", f"{BASE}/test")
    assert response.status_code == 503
    assert response.json()["code"] == "push_unavailable"


def test_the_test_push_goes_to_my_subscriptions_only(as_person, ana, beto, sender):
    mine = subscribe(ana, 1)
    subscribe(ana, 2)
    subscribe(beto, 3)
    response = send(as_person(ana), "post", f"{BASE}/test")
    assert response.status_code == 202
    assert response.json() == {"sent": 2}
    assert sorted(s.endpoint for s, _ in sender.sent)[0] == mine.endpoint
    assert len(sender.sent) == 2
    _, payload = sender.sent[0]
    assert payload["body"].startswith("¡Funciona!")
    assert payload["url"] == "/me/notifications"
    assert payload["title"] == "viajecito"


def test_the_test_push_with_no_subscriptions_sends_zero(as_person, ana, sender):
    response = send(as_person(ana), "post", f"{BASE}/test")
    assert response.status_code == 202
    assert response.json() == {"sent": 0}


def test_the_test_push_is_limited_to_one_per_minute(as_person, ana, sender, time_machine):
    subscribe(ana)
    client = as_person(ana)
    time_machine.move_to("2026-10-01T15:00:10Z", tick=False)
    assert send(client, "post", f"{BASE}/test").status_code == 202
    time_machine.move_to("2026-10-01T15:00:40Z", tick=False)
    limited = send(client, "post", f"{BASE}/test")
    assert limited.status_code == 429
    assert limited.json()["code"] == "rate_limited"
    assert limited["Retry-After"] == "60"
    assert len(sender.sent) == 1
    time_machine.move_to("2026-10-01T15:01:05Z", tick=False)
    assert send(client, "post", f"{BASE}/test").status_code == 202


def test_the_limit_is_per_person(as_person, ana, beto, sender):
    send(as_person(ana), "post", f"{BASE}/test")
    assert send(as_person(beto), "post", f"{BASE}/test").status_code == 202


def test_a_dead_subscription_is_pruned_by_the_test_push(as_person, ana, sender):
    dead = subscribe(ana)
    sender.outcomes[dead.endpoint] = "gone"
    assert send(as_person(ana), "post", f"{BASE}/test").json() == {"sent": 0}
    assert not PushSubscription.objects.exists()
    assert PushDelivery.objects.get().status == "failed"
