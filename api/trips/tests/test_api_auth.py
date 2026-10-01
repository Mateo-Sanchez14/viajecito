import uuid

import pytest
from django.test import RequestFactory
from ninja.errors import AuthenticationError

from shared.api_errors import ApiError
from trips.api_auth import member_of_trip
from trips.models import Trip

pytestmark = pytest.mark.django_db


def request_as(person):
    request = RequestFactory().get("/")
    request.auth = person
    return request


def test_member_of_trip_returns_the_trip_and_the_membership(crew, ana):
    trip = Trip.objects.create(crew=crew, name="x")
    access = member_of_trip(request_as(ana), trip.pk)
    assert access.trip == trip
    assert access.membership.person_id == ana.pk and access.membership.crew_id == crew.pk


def test_member_of_trip_hides_foreign_and_unknown_trips(crew, stranger):
    trip = Trip.objects.create(crew=crew, name="x")
    for trip_id in (trip.pk, uuid.uuid4()):
        with pytest.raises(ApiError) as exc:
            member_of_trip(request_as(stranger), trip_id)
        assert (exc.value.status, exc.value.code) == (404, "not_found")


def test_member_of_trip_requires_authentication(crew):
    trip = Trip.objects.create(crew=crew, name="x")
    request = RequestFactory().get("/")
    request.auth = None
    with pytest.raises(AuthenticationError):
        member_of_trip(request, trip.pk)
