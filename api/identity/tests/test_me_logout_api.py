import pytest

from identity.tests.conftest import MEMBER_PHONE, request_otp, verify_otp

pytestmark = pytest.mark.django_db


@pytest.fixture
def logged_in(client, member, gowa):
    request_otp(client, MEMBER_PHONE)
    assert verify_otp(client, MEMBER_PHONE, gowa.codes()[-1]).status_code == 200
    return client


def test_me_is_401_when_anonymous(client):
    response = client.get("/api/me")
    assert response.status_code == 401
    assert response.json() == {"code": "unauthenticated", "message": response.json()["message"]}


def test_logout_is_401_when_anonymous(client):
    response = client.post("/api/auth/logout")
    assert response.status_code == 401 and response.json()["code"] == "unauthenticated"


def test_me_returns_person_and_crews(logged_in, member, crew):
    response = logged_in.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {
        "person": {
            "id": str(member.pk),
            "phone": MEMBER_PHONE,
            "display_name": "Mateo",
            "locale": "es-AR",
        },
        "crews": [
            {
                "id": str(crew.pk),
                "name": "Los Pibes",
                "role": "admin",
                "gastito_group_url": None,
                "default_trip_id": None,
            }
        ],
    }


def test_logout_returns_204_then_me_is_401(logged_in):
    assert logged_in.post("/api/auth/logout").status_code == 204
    assert logged_in.get("/api/me").status_code == 401


def test_logout_requires_csrf(strict_client, member, gowa):
    token = strict_client.get("/api/auth/csrf").json()["csrf_token"]
    headers = {"HTTP_X_CSRFTOKEN": token}
    request_otp(strict_client, MEMBER_PHONE, **headers)
    verify_otp(strict_client, MEMBER_PHONE, gowa.codes()[-1], **headers)
    denied = strict_client.post("/api/auth/logout")
    assert denied.status_code == 403 and denied.json()["code"] == "csrf_failed"
    fresh = strict_client.cookies["csrftoken"].value
    assert strict_client.post("/api/auth/logout", HTTP_X_CSRFTOKEN=fresh).status_code == 204
