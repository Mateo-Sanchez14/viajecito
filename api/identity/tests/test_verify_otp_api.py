from datetime import UTC, datetime, timedelta

import pytest
import time_machine

from crews.models import CrewMembership, Invite
from identity import domain
from identity.models import OtpChallenge, Person, WhatsAppIdentity
from identity.tests.conftest import MEMBER_PHONE, STRANGER_PHONE, request_otp, verify_otp

T0 = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)

pytestmark = pytest.mark.django_db


def login_code(client, gowa, phone=MEMBER_PHONE):
    request_otp(client, phone)
    return gowa.codes()[-1]


def test_correct_code_logs_in_and_returns_person(client, member, gowa):
    code = login_code(client, gowa)
    response = verify_otp(client, "011 15 5555 1234", code)
    assert response.status_code == 200
    assert response.json() == {
        "person": {
            "id": str(member.pk),
            "phone": MEMBER_PHONE,
            "display_name": "Mateo",
            "locale": "es-AR",
        }
    }
    assert "sessionid" in response.cookies
    assert client.get("/api/me").status_code == 200


def test_login_rotates_the_csrf_token(strict_client, member, gowa):
    token = strict_client.get("/api/auth/csrf").json()["csrf_token"]
    headers = {"HTTP_X_CSRFTOKEN": token}
    request_otp(strict_client, MEMBER_PHONE, **headers)
    before = strict_client.cookies["csrftoken"].value
    response = verify_otp(strict_client, MEMBER_PHONE, gowa.codes()[-1], **headers)
    assert response.status_code == 200
    assert "csrftoken" in response.cookies
    assert strict_client.cookies["csrftoken"].value != before


def test_verify_requires_csrf(strict_client, member, gowa):
    response = verify_otp(strict_client, MEMBER_PHONE, "123456")
    assert response.status_code == 403 and response.json()["code"] == "csrf_failed"


def test_wrong_code_is_invalid_and_counts_an_attempt(client, member, gowa):
    login_code(client, gowa)
    response = verify_otp(
        client, MEMBER_PHONE, "000000" if gowa.codes()[-1] != "000000" else "111111"
    )
    assert response.status_code == 400 and response.json()["code"] == "invalid_code"
    assert OtpChallenge.objects.get().attempts == 1
    assert "sessionid" not in response.cookies


def test_locks_after_five_wrong_codes_even_for_the_right_one(client, member, gowa):
    code = login_code(client, gowa)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert verify_otp(client, MEMBER_PHONE, wrong).json()["code"] == "invalid_code"
    locked = verify_otp(client, MEMBER_PHONE, code)
    assert locked.status_code == 400 and locked.json()["code"] == "too_many_attempts"


def test_expired_code(client, member, gowa):
    with time_machine.travel(T0, tick=False):
        code = login_code(client, gowa)
    with time_machine.travel(T0 + timedelta(seconds=299), tick=False):
        # not consumed here: use a wrong code so the challenge stays live
        verify_otp(client, MEMBER_PHONE, "000000" if code != "000000" else "111111")
    with time_machine.travel(T0 + timedelta(seconds=300), tick=False):
        response = verify_otp(client, MEMBER_PHONE, code)
    assert response.status_code == 400 and response.json()["code"] == "expired_code"


def test_code_is_single_use(client, member, gowa):
    code = login_code(client, gowa)
    assert verify_otp(client, MEMBER_PHONE, code).status_code == 200
    again = verify_otp(client, MEMBER_PHONE, code)
    assert again.status_code == 400 and again.json()["code"] == "invalid_code"


def test_no_challenge_is_invalid_code(client):
    response = verify_otp(client, MEMBER_PHONE, "123456")
    assert response.status_code == 400 and response.json()["code"] == "invalid_code"


def test_invalid_phone(client):
    response = verify_otp(client, "nope", "123456")
    assert response.status_code == 400 and response.json()["code"] == "invalid_phone"


def test_new_request_invalidates_the_old_code(client, member, gowa):
    with time_machine.travel(T0, tick=False):
        old = login_code(client, gowa)
    with time_machine.travel(T0 + timedelta(seconds=61), tick=False):
        new = login_code(client, gowa)
        if old != new:
            assert verify_otp(client, MEMBER_PHONE, old).json()["code"] == "invalid_code"
        assert verify_otp(client, MEMBER_PHONE, new).status_code == 200


def test_ineligible_challenge_can_never_verify(client, gowa):
    pepper = "test-pepper"
    OtpChallenge.objects.create(
        phone=STRANGER_PHONE,
        code_hmac=domain.hash_code(STRANGER_PHONE, "123456", pepper),
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        eligible=False,
        ip="",
        created_at=datetime.now(UTC),
    )
    response = verify_otp(client, STRANGER_PHONE, "123456")
    assert response.status_code == 400 and response.json()["code"] == "invalid_code"
    assert not Person.objects.filter(phone=STRANGER_PHONE).exists()


def test_invite_path_creates_person_and_membership(client, invite, gowa):
    code = login_code(client, gowa, STRANGER_PHONE)
    response = verify_otp(client, STRANGER_PHONE, code)
    assert response.status_code == 200
    person = Person.objects.get(phone=STRANGER_PHONE)
    membership = CrewMembership.objects.get(person=person)
    assert (membership.crew, membership.role, membership.source) == (
        invite.crew,
        "member",
        "invite",
    )
    assert Invite.objects.get().accepted_at is not None
    assert WhatsAppIdentity.objects.get(person=person).jid == "5491155559999@s.whatsapp.net"
    me = client.get("/api/me").json()
    assert [c["name"] for c in me["crews"]] == ["Los Pibes"]


def test_login_is_idempotent_for_whatsapp_identity(client, member, gowa):
    for _ in range(2):
        with time_machine.travel(T0 + timedelta(hours=_), tick=False):
            verify_otp(client, MEMBER_PHONE, login_code(client, gowa))
    assert WhatsAppIdentity.objects.filter(person=member).count() == 1


def test_deactivated_person_cannot_log_in(client, member, gowa):
    code = login_code(client, gowa)
    member.is_active = False
    member.save()
    response = verify_otp(client, MEMBER_PHONE, code)
    assert response.status_code == 400 and response.json()["code"] == "invalid_code"
    assert "sessionid" not in response.cookies
