import pytest

from identity.adapters.django_repos import DjangoIdentityDirectory
from identity.models import Person, WhatsAppIdentity
from identity.use_cases.resolve_sender import resolve_person_id

JID = "5491100000001@s.whatsapp.net"
LID = "251556000000001@lid"


@pytest.fixture
def person(db):
    person = Person.objects.create_user("+5491100000001")
    WhatsAppIdentity.objects.create(person=person, jid=JID, lid=LID)
    return person


@pytest.mark.django_db
def test_resolves_by_jid_first(person):
    assert resolve_person_id(JID, "other@lid", DjangoIdentityDirectory()) == str(person.pk)


@pytest.mark.django_db
def test_falls_back_to_lid(person):
    assert resolve_person_id("", LID, DjangoIdentityDirectory()) == str(person.pk)


@pytest.mark.django_db
def test_unknown_sender_is_none(person):
    assert resolve_person_id("999@s.whatsapp.net", "999@lid", DjangoIdentityDirectory()) is None
    assert resolve_person_id("", "", DjangoIdentityDirectory()) is None
