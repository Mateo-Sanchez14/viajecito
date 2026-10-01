import uuid

import pytest

from identity.models import Person
from identity.use_cases.display_names import display_names

pytestmark = pytest.mark.django_db


def test_display_names_fall_back_to_the_phone_and_skip_unknown_ids():
    ana = Person.objects.create_user("+5491155551111", display_name="Ana")
    nameless = Person.objects.create_user("+5491155552222")
    names = display_names(
        [str(ana.pk), str(nameless.pk), str(uuid.uuid4()), "not-a-uuid"],
    )
    assert names == {str(ana.pk): "Ana", str(nameless.pk): "+5491155552222"}


def test_display_names_of_nobody_is_empty():
    assert display_names([]) == {}
