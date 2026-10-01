import pytest
from django.test import Client

from notifications.models import PushSubscription
from notifications.tests.conftest import AUTH, P256DH, send, sub_body

pytestmark = pytest.mark.django_db

URL = "/api/notifications/subscriptions"


def test_anonymous_callers_get_401(anon):
    for method in ("get", "post", "delete"):
        response = send(anon, method, URL, sub_body())
        assert response.status_code == 401, method
        assert response.json()["code"] == "unauthenticated"


def test_unsafe_requests_need_a_csrf_token(ana):
    client = Client(enforce_csrf_checks=True)
    client.force_login(ana)
    for method in ("post", "delete"):
        response = send(client, method, URL, sub_body())
        assert response.status_code == 403, method
        assert response.json()["code"] == "csrf_failed"
    assert not PushSubscription.objects.exists()


def test_registering_creates_a_subscription_without_echoing_keys(as_person, ana):
    response = send(as_person(ana), "post", URL, sub_body(user_agent="Pixel"))
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "endpoint_host", "created_at"}
    assert body["endpoint_host"] == "fcm.googleapis.com"
    row = PushSubscription.objects.get(pk=body["id"])
    assert (row.person_id, row.p256dh, row.auth, row.user_agent) == (ana.pk, P256DH, AUTH, "Pixel")


def test_registering_the_same_endpoint_again_refreshes_it_with_200(as_person, ana):
    client = as_person(ana)
    first = send(client, "post", URL, sub_body()).json()
    fresh = sub_body()
    fresh["keys"]["auth"] = "Q" * 22
    response = send(client, "post", URL, fresh)
    assert response.status_code == 200
    assert response.json()["id"] == first["id"]
    assert PushSubscription.objects.get().auth == "Q" * 22


def test_an_endpoint_registered_to_someone_else_is_reassigned(as_person, ana, beto):
    send(as_person(ana), "post", URL, sub_body())
    response = send(as_person(beto), "post", URL, sub_body())
    assert response.status_code == 200
    assert PushSubscription.objects.get().person_id == beto.pk
    assert send(as_person(ana), "get", URL).json() == []


@pytest.mark.parametrize(
    "payload",
    [
        sub_body(host="evil.example"),
        {**sub_body(), "endpoint": "http://fcm.googleapis.com/x"},
        {**sub_body(), "keys": {"p256dh": "short", "auth": AUTH}},
        {**sub_body(), "keys": {"p256dh": P256DH, "auth": "***"}},
    ],
)
def test_invalid_subscriptions_are_rejected(as_person, ana, payload):
    response = send(as_person(ana), "post", URL, payload)
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_subscription"
    assert not PushSubscription.objects.exists()


def test_a_malformed_body_is_invalid_request(as_person, ana):
    response = send(as_person(ana), "post", URL, {"endpoint": "https://fcm.googleapis.com/x"})
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_request"


def test_allowlist_follows_settings(as_person, ana, settings):
    settings.NOTIFICATIONS_PUSH_ENDPOINT_HOSTS = "push.example.test, *.push.other.test"
    client = as_person(ana)
    assert send(client, "post", URL, sub_body(host="push.example.test")).status_code == 201
    assert send(client, "post", URL, sub_body(2, host="fcm.googleapis.com")).status_code == 400


def test_more_than_ten_new_subscriptions_per_hour_are_rate_limited(as_person, ana):
    client = as_person(ana)
    for n in range(10):
        assert send(client, "post", URL, sub_body(n)).status_code == 201
    response = send(client, "post", URL, sub_body(99))
    assert response.status_code == 429
    assert response.json()["code"] == "rate_limited"
    assert response["Retry-After"]
    # refreshing one of the existing endpoints is still fine
    assert send(client, "post", URL, sub_body(9)).status_code == 200


def test_old_registrations_do_not_count_against_the_limit(as_person, ana, time_machine):
    client = as_person(ana)
    time_machine.move_to("2026-10-01T10:00:00Z", tick=False)
    for n in range(10):
        send(client, "post", URL, sub_body(n))
    time_machine.move_to("2026-10-01T11:30:00Z", tick=False)
    assert send(client, "post", URL, sub_body(50)).status_code == 201


def test_listing_returns_only_my_subscriptions(as_person, ana, beto):
    send(as_person(ana), "post", URL, sub_body(1))
    send(as_person(beto), "post", URL, sub_body(2))
    rows = send(as_person(ana), "get", URL).json()
    assert [r["endpoint_host"] for r in rows] == ["fcm.googleapis.com"]
    assert len(rows) == 1


def test_delete_removes_my_subscription_and_is_idempotent(as_person, ana):
    client = as_person(ana)
    send(client, "post", URL, sub_body())
    assert send(client, "delete", URL, {"endpoint": sub_body()["endpoint"]}).status_code == 204
    assert not PushSubscription.objects.exists()
    assert send(client, "delete", URL, {"endpoint": sub_body()["endpoint"]}).status_code == 204


def test_delete_never_touches_someone_elses_subscription(as_person, ana, beto):
    send(as_person(ana), "post", URL, sub_body())
    assert (
        send(as_person(beto), "delete", URL, {"endpoint": sub_body()["endpoint"]}).status_code
        == 204
    )
    assert PushSubscription.objects.filter(person=ana).count() == 1


def test_only_the_five_newest_subscriptions_are_kept_per_person(as_person, ana, beto):
    client = as_person(ana)
    send(as_person(beto), "post", URL, sub_body(100))
    for n in range(7):
        assert send(client, "post", URL, sub_body(n)).status_code == 201
    mine = PushSubscription.objects.filter(person=ana).order_by("created_at")
    assert [s.endpoint.rsplit("-", 1)[1] for s in mine] == ["2", "3", "4", "5", "6"]
    assert PushSubscription.objects.filter(person=beto).count() == 1  # others are untouched


def test_refreshing_an_existing_subscription_never_evicts_another(as_person, ana):
    client = as_person(ana)
    for n in range(5):
        send(client, "post", URL, sub_body(n))
    assert send(client, "post", URL, sub_body(0)).status_code == 200
    assert PushSubscription.objects.filter(person=ana).count() == 5
