import json

import pytest

from crews.models import CrewMembership
from identity.models import Person
from identity.tests.conftest import MEMBER_PHONE, post_json, request_otp, verify_otp

pytestmark = pytest.mark.django_db

URL = "/api/me/tour"
OTHER_PHONE = "+5491155557777"


@pytest.fixture
def logged_in(client, member, gowa):
    request_otp(client, MEMBER_PHONE)
    assert verify_otp(client, MEMBER_PHONE, gowa.codes()[-1]).status_code == 200
    return client


def stored(person: Person) -> int:
    person.refresh_from_db()
    return person.tour_seen_version


def seen_in_me(client) -> int:
    return client.get("/api/me").json()["person"]["tour_seen_version"]


def test_anonymous_is_401(client):
    response = post_json(client, URL, {"version": 1})

    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


def test_a_missing_csrf_token_is_403_and_changes_nothing(strict_client, member, gowa):
    token = strict_client.get("/api/auth/csrf").json()["csrf_token"]
    headers = {"HTTP_X_CSRFTOKEN": token}
    request_otp(strict_client, MEMBER_PHONE, **headers)
    verify_otp(strict_client, MEMBER_PHONE, gowa.codes()[-1], **headers)

    denied = post_json(strict_client, URL, {"version": 1})

    assert denied.status_code == 403
    assert denied.json()["code"] == "csrf_failed"
    assert stored(member) == 0
    fresh = strict_client.cookies["csrftoken"].value
    allowed = post_json(strict_client, URL, {"version": 1}, HTTP_X_CSRFTOKEN=fresh)
    assert allowed.status_code == 200
    assert stored(member) == 1


def test_a_new_version_is_stored_and_reflected_by_me(logged_in, member):
    response = post_json(logged_in, URL, {"version": 1})

    assert response.status_code == 200
    assert response.json()["person"]["tour_seen_version"] == 1
    assert response.json()["person"]["id"] == str(member.pk)
    assert stored(member) == 1
    assert seen_in_me(logged_in) == 1


def test_a_lower_version_never_lowers_the_stored_one(logged_in, member):
    post_json(logged_in, URL, {"version": 3})

    response = post_json(logged_in, URL, {"version": 2})

    assert response.status_code == 200
    assert response.json()["person"]["tour_seen_version"] == 3
    assert stored(member) == 3


def test_posting_the_same_version_twice_is_idempotent(logged_in, member):
    first = post_json(logged_in, URL, {"version": 1})
    second = post_json(logged_in, URL, {"version": 1})

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert stored(member) == 1


def test_a_higher_version_wins(logged_in, member):
    post_json(logged_in, URL, {"version": 1})

    response = post_json(logged_in, URL, {"version": 5})

    assert response.json()["person"]["tour_seen_version"] == 5
    assert stored(member) == 5


def test_the_storage_maximum_is_accepted(logged_in, member):
    assert post_json(logged_in, URL, {"version": 32767}).status_code == 200
    assert stored(member) == 32767


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"version": 0},
        {"version": -1},
        {"version": "1"},
        {"version": 1.5},
        {"version": True},
        {"version": None},
        {"version": 32768},
        {"versions": 1},
    ],
    ids=repr,
)
def test_an_invalid_body_is_400_and_leaves_the_value_unchanged(logged_in, member, body):
    post_json(logged_in, URL, {"version": 2})

    response = post_json(logged_in, URL, body)

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_request"
    assert stored(member) == 2


def test_a_body_that_is_not_json_is_400(logged_in, member):
    response = logged_in.post(URL, data="version=1", content_type="application/json")

    assert response.status_code == 400
    assert stored(member) == 0


def test_the_value_is_per_person(client, crew, member, gowa):
    other = Person.objects.create_user(OTHER_PHONE, display_name="Otra")
    CrewMembership.objects.create(crew=crew, person=other, role="member", source="bootstrap")
    request_otp(client, MEMBER_PHONE)
    verify_otp(client, MEMBER_PHONE, gowa.codes()[-1])

    post_json(client, URL, {"version": 4})

    assert stored(member) == 4
    assert stored(other) == 0
    client.post("/api/auth/logout")
    request_otp(client, OTHER_PHONE)
    verify_otp(client, OTHER_PHONE, gowa.codes()[-1])
    assert seen_in_me(client) == 0


def test_the_response_is_a_person_envelope(logged_in):
    response = post_json(logged_in, URL, {"version": 1})

    assert set(json.loads(response.content)) == {"person"}
    assert set(response.json()["person"]) == {
        "id",
        "phone",
        "display_name",
        "locale",
        "tour_seen_version",
    }
