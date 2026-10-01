import json
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import time_machine

from ski.models import GearPlan, LiftPass, Resort, SkiProfile, SnowReport, TripResort
from ski.tests.conftest import send
from ski.tests.factories import make_person, make_resort, make_trip, rsvp

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 7, 15, 18, 30, tzinfo=UTC)


@pytest.fixture(autouse=True)
def frozen():
    with time_machine.travel(NOW, tick=False):
        yield


def ski(trip, suffix=""):
    return f"/api/trips/{trip.pk}/ski{suffix}"


def add_report(resort, *, age=timedelta(hours=1), **fields):
    values = dict(source="open_meteo", base_cm=115, new_24h_cm=Decimal("6.2"))
    values.update(fields)
    return SnowReport.objects.create(
        resort=resort, observed_at=NOW - age, fetched_at=NOW - age, **values
    )


# --- authorization --------------------------------------------------------------------------

TRIP_ROUTES = [
    ("get", "", None),
    ("get", "/conditions", None),
    ("post", "/resorts", {"resort_id": "9d3c1f3e-4f0a-4f6e-8a9a-3a5b6c7d8e9f"}),
    ("patch", "/resorts/{resort}", {"nights": 2}),
    ("delete", "/resorts/{resort}", None),
    ("get", "/resorts/{resort}/reports", None),
    ("post", "/resorts/{resort}/reports", {"base_cm": 10}),
    ("put", "/passes/me", {"status": "needed"}),
    ("delete", "/passes/me", None),
    ("put", "/gear/me", {"items": []}),
]


@pytest.mark.parametrize(("method", "suffix", "payload"), TRIP_ROUTES)
def test_anonymous_is_401(anon, trip, catedral, method, suffix, payload):
    response = send(anon, method, ski(trip, suffix.format(resort=catedral.pk)), payload)
    assert response.status_code == 401 and response.json()["code"] == "unauthenticated"


@pytest.mark.parametrize(("method", "suffix", "payload"), TRIP_ROUTES)
def test_non_members_get_404_not_found(
    as_person, stranger, trip, catedral, method, suffix, payload
):
    url = ski(trip, suffix.format(resort=catedral.pk))
    response = send(as_person(stranger), method, url, payload)
    assert response.status_code == 404 and response.json()["code"] == "not_found"


def test_unknown_trip_is_404(as_person, ana):
    response = as_person(ana).get(f"/api/trips/{uuid.uuid4()}/ski")
    assert response.status_code == 404 and response.json()["code"] == "not_found"


@pytest.mark.parametrize(("method", "suffix", "payload"), TRIP_ROUTES)
def test_generic_trips_do_not_have_the_module(
    as_person, ana, crew, catedral, method, suffix, payload
):
    generic = make_trip(crew, type="generic", resorts=[catedral])
    url = ski(generic, suffix.format(resort=catedral.pk))
    response = send(as_person(ana), method, url, payload)
    assert response.status_code == 404 and response.json()["code"] == "module_not_enabled"


def test_unsafe_requests_need_a_csrf_token(as_person, ana, trip, catedral):
    client = as_person(ana, enforce_csrf_checks=True)
    response = send(client, "put", ski(trip, "/passes/me"), {"status": "bought"})
    assert response.status_code == 403 and response.json()["code"] == "csrf_failed"
    assert not LiftPass.objects.exists()


# --- resorts --------------------------------------------------------------------------------


def test_resort_list_needs_login_but_not_a_crew(as_person, anon, catedral, valle):
    make_resort("closed", active=False)
    assert anon.get("/api/ski/resorts").status_code == 401
    loner = make_person("Solo")
    response = as_person(loner).get("/api/ski/resorts")
    assert response.status_code == 200
    body = response.json()
    assert {r["slug"] for r in body} == {"cerro-catedral", "valle-nevado"}
    assert set(body[0]) == {
        "id",
        "slug",
        "name",
        "country",
        "region",
        "lat",
        "lng",
        "base_elev_m",
        "summit_elev_m",
        "website_url",
    }


def test_resort_list_filters_by_country(as_person, ana, catedral, valle):
    response = as_person(ana).get("/api/ski/resorts", {"country": "CL"})
    assert [r["slug"] for r in response.json()] == ["valle-nevado"]
    assert as_person(ana).get("/api/ski/resorts", {"country": "XX"}).status_code == 400


def test_add_a_resort_to_the_trip(as_person, ana, trip, valle):
    response = send(
        as_person(ana), "post", ski(trip, "/resorts"), {"resort_id": str(valle.pk), "nights": 3}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["resort"]["slug"] == "valle-nevado"
    assert body["nights"] == 3 and body["position"] == 1 and body["latest_report"] is None
    assert TripResort.objects.filter(trip=trip, resort=valle).exists()


def test_adding_the_same_resort_twice_is_409(as_person, ana, trip, catedral):
    response = send(as_person(ana), "post", ski(trip, "/resorts"), {"resort_id": str(catedral.pk)})
    assert response.status_code == 409 and response.json()["code"] == "resort_already_added"


def test_adding_an_unknown_or_inactive_resort_is_400(as_person, ana, trip):
    closed = make_resort("closed", active=False)
    for resort_id in (uuid.uuid4(), closed.pk):
        response = send(
            as_person(ana), "post", ski(trip, "/resorts"), {"resort_id": str(resort_id)}
        )
        assert response.status_code == 400 and response.json()["code"] == "invalid_request"
    response = send(as_person(ana), "post", ski(trip, "/resorts"), {"resort_id": "nope"})
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"


def test_patch_nights_and_position(as_person, ana, trip, catedral):
    response = send(
        as_person(ana), "patch", ski(trip, f"/resorts/{catedral.pk}"), {"nights": 4, "position": 2}
    )
    assert response.status_code == 200
    assert (response.json()["nights"], response.json()["position"]) == (4, 2)
    response = send(as_person(ana), "patch", ski(trip, f"/resorts/{catedral.pk}"), {"nights": None})
    assert response.json()["nights"] is None and response.json()["position"] == 2


def test_patch_or_delete_a_resort_not_on_the_trip_is_404(as_person, ana, trip, valle):
    for method in ("patch", "delete"):
        response = send(as_person(ana), method, ski(trip, f"/resorts/{valle.pk}"), {})
        assert response.status_code == 404 and response.json()["code"] == "not_found"


def test_delete_keeps_the_reports(as_person, ana, trip, catedral):
    add_report(catedral)
    response = as_person(ana).delete(ski(trip, f"/resorts/{catedral.pk}"))
    assert response.status_code == 204
    assert not TripResort.objects.exists() and SnowReport.objects.count() == 1
    assert Resort.objects.filter(pk=catedral.pk).exists()


# --- conditions and reports -----------------------------------------------------------------


def test_conditions_are_cheap_and_flag_stale_data(as_person, ana, crew, catedral, valle):
    trip = make_trip(crew, resorts=[catedral, valle])
    add_report(catedral)
    add_report(valle, age=timedelta(hours=13), source="manual", base_cm=80)
    response = as_person(ana).get(ski(trip, "/conditions"))
    assert response.status_code == 200
    first, second = response.json()["resorts"]
    assert first["resort_id"] == str(catedral.pk) and first["name"] == "Cerro Catedral"
    assert first["latest_report"]["stale"] is False and first["latest_report"]["age_hours"] == 1
    assert first["latest_report"]["base_cm"] == 115 and first["latest_report"]["new_24h_cm"] == 6.2
    assert second["latest_report"]["stale"] is True and second["latest_report"]["age_hours"] == 13


def test_conditions_without_reports(as_person, ana, trip, catedral):
    body = as_person(ana).get(ski(trip, "/conditions")).json()
    assert body == {
        "resorts": [
            {"resort_id": str(catedral.pk), "name": "Cerro Catedral", "latest_report": None}
        ]
    }


def test_reports_list_is_newest_first_and_capped_at_ten(as_person, ana, trip, catedral):
    for hours in range(12):
        add_report(catedral, age=timedelta(hours=hours + 1), base_cm=100 + hours)
    response = as_person(ana).get(ski(trip, f"/resorts/{catedral.pk}/reports"))
    reports = response.json()
    assert len(reports) == 10
    assert [r["base_cm"] for r in reports] == list(range(100, 110))


def test_report_of_a_resort_outside_the_trip_is_404(as_person, ana, trip, valle):
    response = as_person(ana).get(ski(trip, f"/resorts/{valle.pk}/reports"))
    assert response.status_code == 404


def test_post_a_manual_report(as_person, ana, trip, catedral):
    payload = {
        "base_cm": 120,
        "new_24h_cm": 15.5,
        "temp_c": -4,
        "lifts_open": 7,
        "lifts_total": 12,
        "status_text": "Pista\nprincipal\x00 abierta",
    }
    response = send(as_person(ana), "post", ski(trip, f"/resorts/{catedral.pk}/reports"), payload)
    assert response.status_code == 201
    body = response.json()
    assert body["source"] == "manual" and body["base_cm"] == 120 and body["new_24h_cm"] == 15.5
    assert body["lifts_open"] == 7 and body["status_text"] == "Pista principal abierta"
    assert body["reporter"] == {"person_id": str(ana.pk), "display_name": "Ana"}
    assert body["stale"] is False and body["age_hours"] == 0
    saved = SnowReport.objects.get()
    assert saved.observed_at == NOW and saved.reporter_id == ana.pk


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"status_text": "  "},
        {"base_cm": -1},
        {"base_cm": 1001},
        {"new_24h_cm": 301},
        {"temp_c": 31},
        {"lifts_open": 5, "lifts_total": 3},
        {"base_cm": "x"},
    ],
)
def test_invalid_manual_reports_are_400(as_person, ana, trip, catedral, payload):
    response = send(as_person(ana), "post", ski(trip, f"/resorts/{catedral.pk}/reports"), payload)
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"
    assert not SnowReport.objects.exists()


def test_manual_reports_are_rate_limited_per_resort_per_hour(as_person, ana, trip, catedral, valle):
    url = ski(trip, f"/resorts/{catedral.pk}/reports")
    for _ in range(6):
        assert send(as_person(ana), "post", url, {"base_cm": 100}).status_code == 201
    response = send(as_person(ana), "post", url, {"base_cm": 100})
    assert response.status_code == 429 and response.json()["code"] == "rate_limited"
    with time_machine.travel(NOW + timedelta(hours=1, minutes=1), tick=False):
        assert send(as_person(ana), "post", url, {"base_cm": 100}).status_code == 201


# --- passes ---------------------------------------------------------------------------------


def test_put_my_pass_upserts_per_resort(as_person, ana, trip, catedral):
    payload = {
        "resort_id": str(catedral.pk),
        "product": "Pase 5 días",
        "days": 5,
        "status": "bought",
        "price": "250.5",
        "currency": "usd",
    }
    response = send(as_person(ana), "put", ski(trip, "/passes/me"), payload)
    assert response.status_code == 200
    assert response.json() == {
        "person": {"person_id": str(ana.pk), "display_name": "Ana"},
        "resort_id": str(catedral.pk),
        "product": "Pase 5 días",
        "days": 5,
        "status": "bought",
        "price": "250.50",
        "currency": "USD",
    }
    send(
        as_person(ana),
        "put",
        ski(trip, "/passes/me"),
        {"resort_id": str(catedral.pk), "status": "needed"},
    )
    row = LiftPass.objects.get()
    assert row.status == "needed" and row.product == "" and row.price is None


def test_pass_without_resort_and_currency_default(as_person, ana, trip):
    response = send(as_person(ana), "put", ski(trip, "/passes/me"), {"status": "season_pass"})
    body = response.json()
    assert body["resort_id"] is None and body["currency"] == "USD" and body["price"] is None
    send(as_person(ana), "put", ski(trip, "/passes/me"), {"status": "needed"})
    assert LiftPass.objects.filter(resort__isnull=True).count() == 1


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"status": "lost"},
        {"status": "bought", "price": "-1"},
        {"status": "bought", "days": 0},
        {"status": "bought", "currency": "DOLLARS"},
        {"status": "bought", "resort_id": str(uuid.uuid4())},
    ],
)
def test_invalid_passes_are_400(as_person, ana, trip, payload):
    response = send(as_person(ana), "put", ski(trip, "/passes/me"), payload)
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"


def test_passes_are_self_service_only(as_person, ana, beto, trip):
    send(as_person(ana), "put", ski(trip, "/passes/me"), {"status": "bought"})
    send(as_person(beto), "put", ski(trip, "/passes/me"), {"status": "needed"})
    assert LiftPass.objects.get(person=ana).status == "bought"
    assert LiftPass.objects.get(person=beto).status == "needed"
    as_person(beto).delete(ski(trip, "/passes/me"))
    assert LiftPass.objects.get().person_id == ana.pk


def test_delete_my_pass_by_resort(as_person, ana, trip, catedral):
    send(as_person(ana), "put", ski(trip, "/passes/me"), {"status": "bought"})
    send(
        as_person(ana),
        "put",
        ski(trip, "/passes/me"),
        {"resort_id": str(catedral.pk), "status": "bought"},
    )
    assert (
        as_person(ana).delete(ski(trip, f"/passes/me?resort_id={catedral.pk}")).status_code == 204
    )
    assert LiftPass.objects.get().resort_id is None
    assert as_person(ana).delete(ski(trip, "/passes/me")).status_code == 204
    assert not LiftPass.objects.exists()


# --- gear -----------------------------------------------------------------------------------


def test_put_gear_replaces_my_rows(as_person, ana, beto, trip):
    send(
        as_person(beto), "put", ski(trip, "/gear/me"), {"items": [{"item": "skis", "mode": "own"}]}
    )
    first = {
        "items": [
            {
                "item": "skis",
                "mode": "rent",
                "price": "40",
                "currency": "ars",
                "note": "Lo de Juan",
            },
            {"item": "helmet", "mode": "borrow"},
        ]
    }
    response = send(as_person(ana), "put", ski(trip, "/gear/me"), first)
    assert response.status_code == 200
    rows = {r["item"]: r for r in response.json()}
    assert rows["skis"] == {
        "person": {"person_id": str(ana.pk), "display_name": "Ana"},
        "item": "skis",
        "mode": "rent",
        "price": "40.00",
        "currency": "ARS",
        "note": "Lo de Juan",
    }
    send(
        as_person(ana), "put", ski(trip, "/gear/me"), {"items": [{"item": "boots", "mode": "own"}]}
    )
    assert sorted(GearPlan.objects.filter(person=ana).values_list("item", flat=True)) == ["boots"]
    assert GearPlan.objects.filter(person=beto).count() == 1
    assert as_person(ana).get(ski(trip)).status_code == 200
    send(as_person(ana), "put", ski(trip, "/gear/me"), {"items": []})
    assert not GearPlan.objects.filter(person=ana).exists()


@pytest.mark.parametrize(
    "items",
    [
        [{"item": "skis", "mode": "rent"}, {"item": "skis", "mode": "own"}],
        [{"item": "wings", "mode": "own"}],
        [{"item": "skis", "mode": "steal"}],
        [{"item": "skis", "mode": "rent", "price": "-5"}],
    ],
)
def test_invalid_gear_is_400_and_keeps_the_old_rows(as_person, ana, trip, items):
    send(
        as_person(ana), "put", ski(trip, "/gear/me"), {"items": [{"item": "boots", "mode": "own"}]}
    )
    response = send(as_person(ana), "put", ski(trip, "/gear/me"), {"items": items})
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"
    assert GearPlan.objects.get(person=ana).item == "boots"


# --- profile --------------------------------------------------------------------------------


def test_profile_defaults_when_none(as_person, ana, anon):
    assert anon.get("/api/me/ski_profile").status_code == 401
    response = as_person(ana).get("/api/me/ski_profile")
    assert response.status_code == 200
    assert response.json() == {
        "discipline": "ski",
        "level": "beginner",
        "owns_gear": False,
        "boot_size_eu": None,
        "height_cm": None,
        "weight_kg": None,
        "share_sizes_with_trip": False,
    }
    assert not SkiProfile.objects.exists()


def test_profile_roundtrip(as_person, ana):
    payload = {
        "discipline": "both",
        "level": "advanced",
        "owns_gear": True,
        "boot_size_eu": 42.5,
        "height_cm": 180,
        "weight_kg": 78,
        "share_sizes_with_trip": True,
    }
    response = send(as_person(ana), "put", "/api/me/ski_profile", payload)
    assert response.status_code == 200 and response.json() == payload
    assert as_person(ana).get("/api/me/ski_profile").json() == payload
    assert SkiProfile.objects.get(person=ana).boot_size_eu == Decimal("42.5")


@pytest.mark.parametrize(
    "payload",
    [
        {"discipline": "luge"},
        {"level": "god"},
        {"boot_size_eu": 29.5},
        {"boot_size_eu": 50.5},
        {"height_cm": 99},
        {"height_cm": 231},
        {"weight_kg": 24},
        {"weight_kg": 201},
    ],
)
def test_invalid_profiles_are_400(as_person, ana, payload):
    response = send(as_person(ana), "put", "/api/me/ski_profile", payload)
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"


def test_a_profile_is_per_person(as_person, ana, beto):
    send(as_person(ana), "put", "/api/me/ski_profile", {"level": "expert"})
    assert as_person(beto).get("/api/me/ski_profile").json()["level"] == "beginner"


# --- overview -------------------------------------------------------------------------------


def overview(client, trip):
    response = client.get(ski(trip))
    assert response.status_code == 200
    return response.json()


def test_overview_shape(as_person, ana, trip, catedral):
    add_report(catedral)
    rsvp(trip, ana, "in")
    body = overview(as_person(ana), trip)
    assert set(body) == {"resorts", "passes", "gear", "levels"}
    resort = body["resorts"][0]
    assert resort["resort"]["slug"] == "cerro-catedral" and resort["position"] == 0
    assert resort["latest_report"]["base_cm"] == 115
    assert set(body["passes"]) == {"rows", "missing"}
    assert set(body["gear"]) == {"rows", "rent_counts", "sizes", "sizes_hidden"}


def test_overview_lists_who_still_needs_a_pass(as_person, ana, beto, trip, catedral):
    rsvp(trip, ana, "in")
    rsvp(trip, beto, "maybe")
    send(
        as_person(ana),
        "put",
        ski(trip, "/passes/me"),
        {"resort_id": str(catedral.pk), "status": "bought"},
    )
    body = overview(as_person(ana), trip)
    assert body["passes"]["missing"] == [
        {
            "person": {"person_id": str(beto.pk), "display_name": "Beto"},
            "resort_id": str(catedral.pk),
        }
    ]
    assert [r["status"] for r in body["passes"]["rows"]] == ["bought"]


def test_overview_never_leaks_sizes_without_consent(as_person, ana, beto, trip):
    rsvp(trip, ana, "in")
    rsvp(trip, beto, "in")
    send(
        as_person(beto),
        "put",
        "/api/me/ski_profile",
        {"level": "advanced", "boot_size_eu": 43, "height_cm": 181, "weight_kg": 82},
    )
    send(
        as_person(beto), "put", ski(trip, "/gear/me"), {"items": [{"item": "skis", "mode": "rent"}]}
    )
    body = overview(as_person(ana), trip)
    assert body["gear"]["rent_counts"] == {"skis": 1}
    assert body["gear"]["sizes"] == [] and body["gear"]["sizes_hidden"] == 1
    raw = json.dumps(body)
    assert "181" not in raw and "boot_size_eu" not in raw and "weight_kg" not in raw
    assert body["levels"] == [
        {
            "discipline": "ski",
            "level": "advanced",
            "people": [{"person_id": str(beto.pk), "display_name": "Beto"}],
        }
    ]


def test_overview_shares_sizes_only_with_consent_and_for_renters(as_person, ana, beto, trip):
    rsvp(trip, ana, "in")
    rsvp(trip, beto, "in")
    send(
        as_person(beto),
        "put",
        "/api/me/ski_profile",
        {"boot_size_eu": 43, "height_cm": 181, "weight_kg": 82, "share_sizes_with_trip": True},
    )
    body = overview(as_person(ana), trip)
    assert body["gear"]["sizes"] == []  # consented, but is not renting anything on this trip
    send(
        as_person(beto),
        "put",
        ski(trip, "/gear/me"),
        {"items": [{"item": "boots", "mode": "rent"}]},
    )
    body = overview(as_person(ana), trip)
    assert body["gear"]["sizes"] == [
        {
            "person": {"person_id": str(beto.pk), "display_name": "Beto"},
            "boot_size_eu": 43.0,
            "height_cm": 181,
            "weight_kg": 82,
        }
    ]
    assert body["gear"]["sizes_hidden"] == 0


def test_people_who_are_out_do_not_count(as_person, ana, beto, trip):
    rsvp(trip, ana, "in")
    rsvp(trip, beto, "out")
    send(
        as_person(beto), "put", ski(trip, "/gear/me"), {"items": [{"item": "skis", "mode": "rent"}]}
    )
    body = overview(as_person(ana), trip)
    assert body["gear"]["rent_counts"] == {}
    assert body["passes"]["missing"][0]["person"]["display_name"] == "Ana"
