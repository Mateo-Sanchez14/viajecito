import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from identity.models import Person, WhatsAppIdentity


@pytest.mark.django_db
def test_person_is_the_auth_user_model():
    assert get_user_model() is Person
    assert Person.USERNAME_FIELD == "phone"


@pytest.mark.django_db
def test_create_user_has_unusable_password_and_defaults():
    person = Person.objects.create_user("+5491155551234")
    assert not person.has_usable_password()
    assert person.locale == "es-AR"
    assert person.is_active and not person.is_staff
    assert person.created_at and person.updated_at


@pytest.mark.django_db
def test_phone_is_unique():
    Person.objects.create_user("+5491155551234")
    with pytest.raises(IntegrityError), transaction.atomic():
        Person.objects.create_user("+5491155551234")


@pytest.mark.django_db
def test_create_superuser_sets_flags():
    admin = Person.objects.create_superuser("+5491155550000", password="s3cret-pass")
    assert admin.is_staff and admin.is_superuser and admin.check_password("s3cret-pass")


@pytest.mark.django_db
def test_whatsapp_identity_unique_jid_and_nullable_lid():
    one = Person.objects.create_user("+5491155551234")
    two = Person.objects.create_user("+5491155551235")
    WhatsAppIdentity.objects.create(person=one, jid="5491155551234@s.whatsapp.net")
    WhatsAppIdentity.objects.create(person=two, jid="5491155551235@s.whatsapp.net")  # lid None x2
    with pytest.raises(IntegrityError), transaction.atomic():
        WhatsAppIdentity.objects.create(person=two, jid="5491155551234@s.whatsapp.net")
