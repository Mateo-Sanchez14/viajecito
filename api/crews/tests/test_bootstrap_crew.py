import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from crews.models import Crew, CrewMembership, WhatsAppGroupLink
from identity.models import Person

CHAT = "120363000000000001@g.us"


def run(**overrides):
    args = {"name": "Los Pibes", "chat_id": CHAT, "admin_phone": "011 15 5555 1234"}
    args.update(overrides)
    call_command(
        "bootstrap_crew",
        "--name",
        args["name"],
        "--chat-id",
        args["chat_id"],
        "--admin-phone",
        args["admin_phone"],
    )


@pytest.mark.django_db
def test_creates_crew_link_person_and_admin_membership():
    run()
    crew = Crew.objects.get()
    assert crew.name == "Los Pibes"
    assert WhatsAppGroupLink.objects.get().chat_id == CHAT
    person = Person.objects.get(phone="+5491155551234")
    membership = CrewMembership.objects.get()
    assert (membership.crew, membership.person) == (crew, person)
    assert (membership.role, membership.source, membership.status) == (
        "admin",
        "bootstrap",
        "active",
    )


@pytest.mark.django_db
def test_is_idempotent_for_the_same_chat_id():
    run()
    run(name="Renamed", admin_phone="+56 9 8765 4321")
    assert Crew.objects.get().name == "Los Pibes"
    assert CrewMembership.objects.count() == 1
    assert Person.objects.count() == 1


@pytest.mark.django_db
def test_reuses_an_existing_person():
    existing = Person.objects.create_user("+5491155551234", display_name="Mateo")
    run()
    assert CrewMembership.objects.get().person == existing


@pytest.mark.django_db
@pytest.mark.parametrize(
    "overrides",
    [{"chat_id": "12345@s.whatsapp.net"}, {"admin_phone": "nope"}, {"name": "  "}],
)
def test_rejects_invalid_input(overrides):
    with pytest.raises(CommandError):
        run(**overrides)
    assert Crew.objects.count() == 0
