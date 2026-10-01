import pytest
from django.core.exceptions import ValidationError

from crews.adapters.django_store import DjangoCrewStore
from crews.models import Crew, CrewMembership, Invite
from crews.use_cases.accept_invites import accept_invites
from crews.use_cases.is_phone_eligible import is_phone_eligible
from identity.models import Person

pytestmark = pytest.mark.django_db

PHONE = "+5491155551234"


@pytest.fixture
def crew():
    return Crew.objects.create(name="Los Pibes")


def test_invite_phone_is_normalized_on_save(crew):
    invite = Invite.objects.create(crew=crew, phone="011 15 5555 1234")
    assert invite.phone == PHONE
    assert is_phone_eligible(PHONE, DjangoCrewStore()) is True


def test_invite_clean_normalizes_and_rejects_garbage(crew):
    invite = Invite(crew=crew, phone="011 15 5555 1234")
    invite.full_clean(exclude=["crew"])
    assert invite.phone == PHONE
    with pytest.raises(ValidationError):
        Invite(crew=crew, phone="nope").full_clean(exclude=["crew"])


def test_person_phone_is_normalized_on_save_and_clean():
    person = Person(phone="+54 9 11 5555-1234")
    person.full_clean(exclude=["password"])
    assert person.phone == PHONE
    assert Person.objects.create_user("011 15 5555 1235").phone == "+5491155551235"
    with pytest.raises(ValidationError):
        Person(phone="nope").full_clean(exclude=["password"])


def test_removing_a_member_cancels_their_pending_invites(crew):
    person = Person.objects.create_user(PHONE)
    membership = CrewMembership.objects.create(crew=crew, person=person, source="invite")
    other = Crew.objects.create(name="Otros")
    Invite.objects.create(crew=crew, phone=PHONE)
    Invite.objects.create(crew=other, phone=PHONE)
    membership.status = "removed"
    membership.save()
    cancelled = {i.crew_id: i.cancelled_at is not None for i in Invite.objects.all()}
    assert cancelled == {crew.pk: True, other.pk: False}
    assert is_phone_eligible(PHONE, DjangoCrewStore()) is True  # still invited to the other crew


def test_cancelled_invite_neither_makes_eligible_nor_reactivates(crew):
    person = Person.objects.create_user(PHONE)
    membership = CrewMembership.objects.create(crew=crew, person=person, source="invite")
    Invite.objects.create(crew=crew, phone=PHONE)
    membership.status = "removed"
    membership.save()
    store = DjangoCrewStore()
    assert is_phone_eligible(PHONE, store) is False
    assert accept_invites(person.pk, PHONE, store) == 0
    membership.refresh_from_db()
    assert membership.status == "removed"


def test_a_fresh_invite_after_removal_reactivates(crew):
    person = Person.objects.create_user(PHONE)
    membership = CrewMembership.objects.create(crew=crew, person=person, source="invite")
    membership.status = "removed"
    membership.save()
    Invite.objects.create(crew=crew, phone=PHONE)
    assert accept_invites(person.pk, PHONE, DjangoCrewStore()) == 1
    membership.refresh_from_db()
    assert membership.status == "active"
