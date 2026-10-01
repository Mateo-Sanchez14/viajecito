import uuid

import pytest
from django.test import RequestFactory
from ninja.errors import AuthenticationError

from crews.adapters.django_store import DjangoCrewStore
from crews.api_auth import member_of_crew
from crews.domain import NotMember
from crews.models import Crew, CrewMembership
from crews.use_cases.authz import require_active_member
from identity.models import Person
from shared.api_errors import ApiError

pytestmark = pytest.mark.django_db


@pytest.fixture
def crew():
    return Crew.objects.create(name="Los Pibes")


@pytest.fixture
def person():
    return Person.objects.create_user("+5491155551234")


def join(crew, person, status="active"):
    return CrewMembership.objects.create(
        crew=crew, person=person, role="member", source="invite", status=status
    )


def request_as(person):
    request = RequestFactory().get("/")
    request.auth = person
    return request


class FakeStore:
    def __init__(self, active):
        self.active = active

    def is_active_member(self, crew_id, person_id):
        return (crew_id, person_id) in self.active


def test_use_case_passes_for_an_active_member():
    require_active_member("p1", "c1", FakeStore({("c1", "p1")}))


def test_use_case_raises_not_member_otherwise():
    with pytest.raises(NotMember):
        require_active_member("p1", "c1", FakeStore(set()))


def test_use_case_with_the_django_store_ignores_removed_members(crew, person):
    join(crew, person, status="removed")
    with pytest.raises(NotMember):
        require_active_member(str(person.pk), str(crew.pk), DjangoCrewStore())


def test_member_of_crew_returns_the_membership(crew, person):
    membership = join(crew, person)
    assert member_of_crew(request_as(person), crew.pk) == membership


def test_member_of_crew_accepts_a_string_id(crew, person):
    join(crew, person)
    assert member_of_crew(request_as(person), str(crew.pk)).crew_id == crew.pk


@pytest.mark.parametrize("status", ["removed", None])
def test_non_member_gets_a_404_not_found(crew, person, status):
    if status:
        join(crew, person, status=status)
    with pytest.raises(ApiError) as exc:
        member_of_crew(request_as(person), crew.pk)
    assert (exc.value.status, exc.value.code) == (404, "not_found")


def test_unknown_crew_is_indistinguishable_from_a_foreign_one(person):
    with pytest.raises(ApiError) as exc:
        member_of_crew(request_as(person), uuid.uuid4())
    assert (exc.value.status, exc.value.code) == (404, "not_found")


def test_anonymous_requests_are_unauthenticated(crew):
    request = RequestFactory().get("/")
    request.auth = None
    with pytest.raises(AuthenticationError):
        member_of_crew(request, crew.pk)
