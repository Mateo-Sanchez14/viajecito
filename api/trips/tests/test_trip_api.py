import uuid

import pytest

from trips.models import Participation, Trip
from trips.tests.conftest import send

pytestmark = pytest.mark.django_db

GENERIC_MODULES = ["proposals", "dates", "logistics", "itinerary", "today", "budget", "documents"]


def trips_url(crew):
    return f"/api/crews/{crew.pk}/trips"


def trip_url(trip):
    return f"/api/trips/{trip.pk}"


@pytest.fixture
def trip(crew, ana):
    created = Trip.objects.create(crew=crew, name="Bariloche")
    Participation.objects.create(trip=created, person=ana, rsvp="in")
    return created


# --- list -----------------------------------------------------------------------------------


def test_list_returns_summaries_of_the_crew_trips_only(as_person, crew, other_crew, ana, trip):
    Trip.objects.create(crew=other_crew, name="Secret")
    response = as_person(ana).get(trips_url(crew))
    assert response.status_code == 200
    assert response.json() == [
        {
            "id": str(trip.pk),
            "name": "Bariloche",
            "type": "generic",
            "status": "planning",
            "start_on": None,
            "end_on": None,
            "destination_label": "",
        }
    ]


def test_list_is_404_for_a_non_member(as_person, crew, stranger):
    response = as_person(stranger).get(trips_url(crew))
    assert response.status_code == 404 and response.json()["code"] == "not_found"


def test_list_is_404_for_a_removed_member(as_person, crew, beto):
    crew.memberships.filter(person=beto).update(status="removed")
    assert as_person(beto).get(trips_url(crew)).status_code == 404


def test_list_is_401_when_anonymous(anon, crew):
    response = anon.get(trips_url(crew))
    assert response.status_code == 401 and response.json()["code"] == "unauthenticated"


# --- create ---------------------------------------------------------------------------------


def test_create_returns_the_trip_and_enrolls_the_creator(as_person, crew, ana):
    payload = {
        "name": "  Bariloche  ",
        "start_on": "2026-07-10",
        "end_on": "2026-07-17",
        "destination_label": "Cerro Catedral",
        "currency": "usd",
    }
    response = send(as_person(ana), "post", trips_url(crew), payload)
    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "crew_id": str(crew.pk),
        "name": "Bariloche",
        "type": "generic",
        "status": "planning",
        "start_on": "2026-07-10",
        "end_on": "2026-07-17",
        "destination_label": "Cerro Catedral",
        "timezone": "America/Santiago",
        "currency": "USD",
        "modules": GENERIC_MODULES,
        "participants": [{"person_id": str(ana.pk), "display_name": "Ana", "rsvp": "in"}],
        "my_rsvp": "in",
    }


def test_create_sets_the_default_trip_only_when_it_is_null(as_person, crew, ana):
    client = as_person(ana)
    first = send(client, "post", trips_url(crew), {"name": "One"}).json()["id"]
    send(client, "post", trips_url(crew), {"name": "Two"})
    crew.refresh_from_db()
    assert str(crew.default_trip_id) == first


def test_me_exposes_the_default_trip(as_person, crew, ana):
    client = as_person(ana)
    trip_id = send(client, "post", trips_url(crew), {"name": "One"}).json()["id"]
    assert client.get("/api/me").json()["crews"][0]["default_trip_id"] == trip_id


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "   "},
        {"name": ""},
        {},
        {"name": "x", "start_on": "2026-07-10", "end_on": "2026-07-09"},
        {"name": "x", "start_on": "not-a-date"},
        {"name": "x", "currency": "DOLLARS"},
        {"name": "x", "type": "martian"},
        {"name": "x" * 121},
    ],
)
def test_create_rejects_invalid_input_with_400(as_person, crew, ana, payload):
    response = send(as_person(ana), "post", trips_url(crew), payload)
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"
    assert Trip.objects.count() == 0


def test_create_is_404_for_a_non_member_and_401_when_anonymous(as_person, anon, crew, stranger):
    assert send(as_person(stranger), "post", trips_url(crew), {"name": "x"}).status_code == 404
    assert send(anon, "post", trips_url(crew), {"name": "x"}).status_code == 401
    assert Trip.objects.count() == 0


# --- get ------------------------------------------------------------------------------------


def test_get_returns_the_full_trip(as_person, trip, ana, beto):
    Participation.objects.create(trip=trip, person=beto, rsvp="maybe")
    body = as_person(beto).get(trip_url(trip)).json()
    assert body["id"] == str(trip.pk) and body["modules"] == GENERIC_MODULES
    assert body["my_rsvp"] == "maybe"
    assert {(p["display_name"], p["rsvp"]) for p in body["participants"]} == {
        ("Ana", "in"),
        ("Beto", "maybe"),
    }


def test_get_my_rsvp_is_pending_for_a_member_without_a_participation(as_person, trip, beto):
    assert as_person(beto).get(trip_url(trip)).json()["my_rsvp"] == "pending"


def test_get_unknown_type_falls_back_to_the_generic_modules(as_person, trip, ana):
    Trip.objects.filter(pk=trip.pk).update(type="retired")
    body = as_person(ana).get(trip_url(trip)).json()
    assert body["type"] == "retired" and body["modules"] == GENERIC_MODULES


def test_get_is_404_for_a_non_member_an_unknown_id_and_a_removed_member(
    as_person, trip, stranger, beto, crew
):
    for client, url in [
        (as_person(stranger), trip_url(trip)),
        (as_person(beto), f"/api/trips/{uuid.uuid4()}"),
    ]:
        response = client.get(url)
        assert response.status_code == 404 and response.json()["code"] == "not_found"
    crew.memberships.filter(person=beto).update(status="removed")
    assert as_person(beto).get(trip_url(trip)).status_code == 404


def test_get_is_401_when_anonymous(anon, trip):
    assert anon.get(trip_url(trip)).status_code == 401


# --- patch ----------------------------------------------------------------------------------


def test_any_active_member_can_patch(as_person, trip, beto):
    response = send(
        as_person(beto), "patch", trip_url(trip), {"status": "booked", "name": "Catedral"}
    )
    assert response.status_code == 200
    assert (response.json()["status"], response.json()["name"]) == ("booked", "Catedral")
    trip.refresh_from_db()
    assert (trip.status, trip.name) == ("booked", "Catedral")


def test_patch_changes_only_the_given_fields_and_can_clear_dates(as_person, trip, ana):
    Trip.objects.filter(pk=trip.pk).update(start_on="2026-07-10", end_on="2026-07-12")
    client = as_person(ana)
    send(client, "patch", trip_url(trip), {"destination_label": "Sur"})
    trip.refresh_from_db()
    assert (str(trip.start_on), trip.destination_label, trip.name) == (
        "2026-07-10",
        "Sur",
        "Bariloche",
    )
    send(client, "patch", trip_url(trip), {"start_on": None, "end_on": None})
    trip.refresh_from_db()
    assert (trip.start_on, trip.end_on) == (None, None)


def test_patch_validates_the_merged_dates(as_person, trip, ana):
    Trip.objects.filter(pk=trip.pk).update(start_on="2026-07-10")
    response = send(as_person(ana), "patch", trip_url(trip), {"end_on": "2026-07-01"})
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"


@pytest.mark.parametrize(
    "payload",
    [{"status": "cancelled"}, {"name": " "}, {"name": None}, {"currency": "xx"}, {"type": "x"}],
)
def test_patch_rejects_invalid_input(as_person, trip, ana, payload):
    response = send(as_person(ana), "patch", trip_url(trip), payload)
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"


def test_patch_is_404_for_a_non_member_and_401_when_anonymous(as_person, anon, trip, stranger):
    assert send(as_person(stranger), "patch", trip_url(trip), {"name": "x"}).status_code == 404
    assert send(anon, "patch", trip_url(trip), {"name": "x"}).status_code == 401
    trip.refresh_from_db()
    assert trip.name == "Bariloche"


# --- participation --------------------------------------------------------------------------


def test_put_participation_creates_then_updates_the_callers_row(as_person, trip, beto):
    client = as_person(beto)
    url = f"{trip_url(trip)}/participation"
    first = send(client, "put", url, {"rsvp": "in"})
    assert first.status_code == 200
    assert first.json() == {"person_id": str(beto.pk), "display_name": "Beto", "rsvp": "in"}
    assert send(client, "put", url, {"rsvp": "out"}).json()["rsvp"] == "out"
    assert Participation.objects.filter(trip=trip, person=beto).count() == 1
    assert client.get(trip_url(trip)).json()["my_rsvp"] == "out"


def test_put_participation_rejects_an_unknown_rsvp(as_person, trip, beto):
    response = send(as_person(beto), "put", f"{trip_url(trip)}/participation", {"rsvp": "yes"})
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"


def test_put_participation_is_404_for_a_non_member_and_401_when_anonymous(
    as_person, anon, trip, stranger
):
    url = f"{trip_url(trip)}/participation"
    assert send(as_person(stranger), "put", url, {"rsvp": "in"}).status_code == 404
    assert send(anon, "put", url, {"rsvp": "in"}).status_code == 401
    assert Participation.objects.filter(person=stranger).count() == 0
