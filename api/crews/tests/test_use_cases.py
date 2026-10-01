import pytest

from crews.adapters.django_store import DjangoCrewStore
from crews.models import Crew, CrewMembership, Invite
from crews.use_cases.accept_invites import accept_invites
from crews.use_cases.crews_for import crews_for
from crews.use_cases.is_phone_eligible import is_phone_eligible
from identity.models import Person

PHONE = "+5491155551234"


@pytest.fixture
def store():
    return DjangoCrewStore()


@pytest.fixture
def crew():
    return Crew.objects.create(name="Los Pibes")


@pytest.mark.django_db
def test_unknown_phone_is_not_eligible(store):
    assert is_phone_eligible(PHONE, store) is False


@pytest.mark.django_db
def test_active_member_is_eligible(store, crew):
    person = Person.objects.create_user(PHONE)
    CrewMembership.objects.create(crew=crew, person=person, role="member", source="invite")
    assert is_phone_eligible(PHONE, store) is True


@pytest.mark.django_db
def test_removed_member_is_not_eligible(store, crew):
    person = Person.objects.create_user(PHONE)
    CrewMembership.objects.create(
        crew=crew, person=person, role="member", source="invite", status="removed"
    )
    assert is_phone_eligible(PHONE, store) is False


@pytest.mark.django_db
def test_pending_invite_is_eligible_but_accepted_is_not(store, crew):
    invite = Invite.objects.create(crew=crew, phone=PHONE)
    assert is_phone_eligible(PHONE, store) is True
    invite.accepted_at = invite.created_at
    invite.save()
    assert is_phone_eligible(PHONE, store) is False


@pytest.mark.django_db
def test_accept_invites_creates_membership_and_marks_accepted(store, crew):
    person = Person.objects.create_user(PHONE)
    invite = Invite.objects.create(crew=crew, phone=PHONE)
    assert accept_invites(person.pk, PHONE, store) == 1
    membership = CrewMembership.objects.get()
    assert (membership.role, membership.source, membership.status) == ("member", "invite", "active")
    invite.refresh_from_db()
    assert invite.accepted_at is not None
    assert accept_invites(person.pk, PHONE, store) == 0


@pytest.mark.django_db
def test_accept_invites_reactivates_a_removed_membership(store, crew):
    person = Person.objects.create_user(PHONE)
    CrewMembership.objects.create(
        crew=crew, person=person, role="member", source="group_sync", status="removed"
    )
    Invite.objects.create(crew=crew, phone=PHONE)
    accept_invites(person.pk, PHONE, store)
    assert CrewMembership.objects.get().status == "active"


@pytest.mark.django_db
def test_crews_for_lists_active_memberships_only(store, crew):
    person = Person.objects.create_user(PHONE)
    other = Crew.objects.create(name="Otros")
    CrewMembership.objects.create(crew=crew, person=person, role="admin", source="bootstrap")
    CrewMembership.objects.create(
        crew=other, person=person, role="member", source="invite", status="removed"
    )
    summaries = crews_for(person.pk, store)
    assert [(s.name, s.role) for s in summaries] == [("Los Pibes", "admin")]
    assert summaries[0].gastito_group_url is None and summaries[0].default_trip_id is None
