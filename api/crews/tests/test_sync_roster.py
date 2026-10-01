from datetime import UTC, datetime, timedelta

import pytest

from crews.adapters.django_store import DjangoCrewStore
from crews.models import Crew, CrewMembership, WhatsAppGroupLink
from crews.use_cases.sync_roster import RosterEntry, crews_needing_sync, sync_roster
from identity.models import Person, WhatsAppIdentity
from shared.clock import FrozenClock

CHAT = "120363000000000000@g.us"
NOW = datetime(2025, 10, 15, 12, 0, tzinfo=UTC)


class FakeSource:
    def __init__(self, entries):
        self.entries = entries
        self.asked: list[str] = []

    def participants(self, chat_id):
        self.asked.append(chat_id)
        return self.entries


@pytest.fixture
def crew(db):
    crew = Crew.objects.create(name="Los Pibes")
    WhatsAppGroupLink.objects.create(crew=crew, chat_id=CHAT)
    return crew


def run(crew, entries):
    source = FakeSource(entries)
    result = sync_roster(str(crew.pk), source, DjangoCrewStore(), FrozenClock(NOW))
    return result, source


def entry(phone="5491100000001", *, lid="251556000000001@lid", name="Ana", jid=None):
    return RosterEntry(
        jid=jid or f"{phone}@s.whatsapp.net", phone=phone, lid=lid, display_name=name
    )


@pytest.mark.django_db
def test_creates_person_identity_and_membership(crew):
    result, source = run(crew, [entry()])
    assert source.asked == [CHAT]
    assert (result.created, result.existing, result.skipped) == (1, 0, 0)
    person = Person.objects.get(phone="+5491100000001")
    assert person.display_name == "Ana"
    identity = WhatsAppIdentity.objects.get(person=person)
    assert (identity.jid, identity.lid) == ("5491100000001@s.whatsapp.net", "251556000000001@lid")
    membership = CrewMembership.objects.get(crew=crew, person=person)
    assert (membership.role, membership.source, membership.status) == (
        "member",
        "group_sync",
        "active",
    )
    crew.whatsapp_group.refresh_from_db()
    assert crew.whatsapp_group.last_synced_at == NOW


@pytest.mark.django_db
def test_is_idempotent(crew):
    run(crew, [entry()])
    result, _ = run(crew, [entry()])
    assert (result.created, result.existing) == (0, 1)
    assert Person.objects.count() == 1 and WhatsAppIdentity.objects.count() == 1
    assert CrewMembership.objects.count() == 1


@pytest.mark.django_db
def test_phone_number_with_jid_suffix_and_device_part_is_normalized(crew):
    run(crew, [entry(phone="5491100000001:7@s.whatsapp.net")])
    assert Person.objects.filter(phone="+5491100000001").exists()


@pytest.mark.django_db
def test_phone_is_derived_from_the_jid_when_phone_number_is_absent(crew):
    run(
        crew,
        [RosterEntry(jid="5491100000002@s.whatsapp.net", phone=None, lid=None, display_name="")],
    )
    assert Person.objects.filter(phone="+5491100000002").exists()
    assert WhatsAppIdentity.objects.get().lid is None


@pytest.mark.django_db
def test_lid_only_participant_without_a_phone_is_skipped(crew):
    result, _ = run(
        crew,
        [
            RosterEntry(
                jid="251556000000009@lid", phone=None, lid="251556000000009@lid", display_name=""
            )
        ],
    )
    assert (result.created, result.skipped) == (0, 1)
    assert Person.objects.count() == 0


@pytest.mark.django_db
def test_invalid_phone_is_skipped(crew):
    result, _ = run(crew, [entry(phone="123")])
    assert result.skipped == 1 and Person.objects.count() == 0


@pytest.mark.django_db
def test_existing_admin_is_never_downgraded(crew):
    person = Person.objects.create_user("+5491100000001")
    CrewMembership.objects.create(crew=crew, person=person, role="admin", source="bootstrap")
    result, _ = run(crew, [entry()])
    membership = CrewMembership.objects.get()
    assert (membership.role, membership.source) == ("admin", "bootstrap")
    assert result.existing == 1


@pytest.mark.django_db
def test_removed_member_is_not_reactivated(crew):
    person = Person.objects.create_user("+5491100000001")
    CrewMembership.objects.create(
        crew=crew, person=person, role="member", source="invite", status="removed"
    )
    run(crew, [entry()])
    assert CrewMembership.objects.get().status == "removed"


@pytest.mark.django_db
def test_existing_person_keeps_their_name_and_gains_the_lid(crew):
    person = Person.objects.create_user("+5491100000001", display_name="Mateo")
    WhatsAppIdentity.objects.create(person=person, jid="5491100000001@s.whatsapp.net")
    run(crew, [entry(name="Ana Pushname")])
    person.refresh_from_db()
    assert person.display_name == "Mateo"
    assert WhatsAppIdentity.objects.get().lid == "251556000000001@lid"


@pytest.mark.django_db
def test_lid_already_owned_by_another_identity_is_not_stolen(crew):
    other = Person.objects.create_user("+5491100000003")
    WhatsAppIdentity.objects.create(
        person=other, jid="5491100000003@s.whatsapp.net", lid="251556000000001@lid"
    )
    run(crew, [entry()])
    mine = WhatsAppIdentity.objects.get(jid="5491100000001@s.whatsapp.net")
    assert mine.lid is None


@pytest.mark.django_db
def test_members_missing_from_the_group_are_not_removed(crew):
    person = Person.objects.create_user("+5491100000009")
    CrewMembership.objects.create(crew=crew, person=person, source="invite")
    run(crew, [entry()])
    assert CrewMembership.objects.get(person=person).status == "active"


@pytest.mark.django_db
def test_crews_needing_sync_lists_never_and_stale_crews(crew):
    fresh = Crew.objects.create(name="Fresh")
    stale = Crew.objects.create(name="Stale")
    WhatsAppGroupLink.objects.create(
        crew=fresh, chat_id="120363000000000002@g.us", last_synced_at=NOW - timedelta(hours=1)
    )
    WhatsAppGroupLink.objects.create(
        crew=stale, chat_id="120363000000000003@g.us", last_synced_at=NOW - timedelta(hours=30)
    )
    due = crews_needing_sync(NOW - timedelta(hours=24), DjangoCrewStore())
    assert set(due) == {str(crew.pk), str(stale.pk)}
