from datetime import UTC, datetime, timedelta

import pytest
import time_machine

from crews.models import CrewMembership
from ski.models import LiftPass, SnowReport
from ski.tests.conftest import send
from ski.tests.factories import make_crew, make_person, make_resort, make_trip

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 7, 15, 18, 30, tzinfo=UTC)
NOTE = "Pista roja cerrada, llamar a +54 9 11 5555-0000"


@pytest.fixture(autouse=True)
def frozen():
    with time_machine.travel(NOW, tick=False):
        yield


@pytest.fixture
def catedral():
    return make_resort("cerro-catedral", name="Cerro Catedral")


@pytest.fixture
def crew_a():
    return make_crew("Crew A")


@pytest.fixture
def crew_b():
    return make_crew("Crew B")


@pytest.fixture
def ana(crew_a):
    return make_person("Ana", crew_a)


@pytest.fixture
def zoe(crew_b):
    return make_person("Zoe", crew_b)


def manual(resort, reporter, **fields):
    return SnowReport.objects.create(
        resort=resort,
        source="manual",
        observed_at=NOW - timedelta(hours=1),
        fetched_at=NOW - timedelta(hours=1),
        reporter=reporter,
        base_cm=120,
        lifts_open=7,
        lifts_total=12,
        status_text=NOTE,
        **fields,
    )


def conditions(as_person, person, trip):
    response = as_person(person).get(f"/api/trips/{trip.pk}/ski/conditions")
    assert response.status_code == 200
    return response.json()["resorts"][0]["latest_report"]


# --- 1. reports of other crews never reveal who wrote them or what they wrote ---------------


def test_another_crews_manual_report_shows_numbers_only(
    as_person, catedral, crew_a, crew_b, ana, zoe
):
    trip_a = make_trip(crew_a, resorts=[catedral])
    trip_b = make_trip(crew_b, resorts=[catedral])
    manual(catedral, ana)
    mine = conditions(as_person, ana, trip_a)
    assert mine["reporter"]["display_name"] == "Ana" and mine["status_text"] == NOTE
    theirs = conditions(as_person, zoe, trip_b)
    assert theirs["reporter"] is None and theirs["status_text"] == ""
    assert theirs["base_cm"] == 120 and theirs["lifts_open"] == 7 and theirs["source"] == "manual"
    assert str(ana.pk) not in str(theirs) and ana.phone not in str(theirs)


def test_every_read_path_redacts_for_outsiders(as_person, catedral, crew_a, crew_b, ana, zoe):
    make_trip(crew_a, resorts=[catedral])
    trip_b = make_trip(crew_b, resorts=[catedral])
    manual(catedral, ana)
    client = as_person(zoe)
    overview = client.get(f"/api/trips/{trip_b.pk}/ski").json()
    history = client.get(f"/api/trips/{trip_b.pk}/ski/resorts/{catedral.pk}/reports").json()
    for report in (overview["resorts"][0]["latest_report"], history[0]):
        assert report["reporter"] is None and report["status_text"] == ""
    assert str(ana.pk) not in str(overview) + str(history)


def test_a_reporter_who_left_the_crew_is_hidden_even_from_it(as_person, catedral, crew_a, ana):
    other = make_person("Beto", crew_a)
    trip = make_trip(crew_a, resorts=[catedral])
    manual(catedral, other)
    CrewMembership.objects.filter(person=other).update(status="removed")
    report = conditions(as_person, ana, trip)
    assert report["reporter"] is None and report["status_text"] == ""


def test_a_reporter_without_a_display_name_is_never_shown_as_a_phone(
    as_person, catedral, crew_a, ana
):
    nameless = make_person("", crew_a)
    trip = make_trip(crew_a, resorts=[catedral])
    manual(catedral, nameless)
    report = conditions(as_person, ana, trip)
    assert report["reporter"] is None and nameless.phone not in str(report)


def test_posting_still_returns_the_reporter_to_their_own_crew(as_person, catedral, crew_a, ana):
    trip = make_trip(crew_a, resorts=[catedral])
    url = f"/api/trips/{trip.pk}/ski/resorts/{catedral.pk}/reports"
    body = send(as_person(ana), "post", url, {"base_cm": 90, "status_text": "ok"}).json()
    assert body["reporter"]["display_name"] == "Ana" and body["status_text"] == "ok"


# --- 3 + 4. the manual-report limit is per resort AND reporter, with Retry-After -------------


def test_one_trips_reports_do_not_block_another_trips_first(
    as_person, catedral, crew_a, crew_b, ana, zoe
):
    trip_a = make_trip(crew_a, resorts=[catedral])
    trip_b = make_trip(crew_b, resorts=[catedral])
    url_a = f"/api/trips/{trip_a.pk}/ski/resorts/{catedral.pk}/reports"
    url_b = f"/api/trips/{trip_b.pk}/ski/resorts/{catedral.pk}/reports"
    for _ in range(6):
        assert send(as_person(ana), "post", url_a, {"base_cm": 100}).status_code == 201
    assert send(as_person(ana), "post", url_a, {"base_cm": 100}).status_code == 429
    assert send(as_person(zoe), "post", url_b, {"base_cm": 100}).status_code == 201


def test_a_crewmate_is_not_blocked_by_someone_elses_six(as_person, catedral, crew_a, ana):
    beto = make_person("Beto", crew_a)
    trip = make_trip(crew_a, resorts=[catedral])
    url = f"/api/trips/{trip.pk}/ski/resorts/{catedral.pk}/reports"
    for _ in range(6):
        send(as_person(ana), "post", url, {"base_cm": 100})
    assert send(as_person(beto), "post", url, {"base_cm": 100}).status_code == 201


def test_the_429_says_when_to_retry(as_person, catedral, crew_a, ana):
    trip = make_trip(crew_a, resorts=[catedral])
    url = f"/api/trips/{trip.pk}/ski/resorts/{catedral.pk}/reports"
    with time_machine.travel(NOW - timedelta(minutes=50), tick=False):
        send(as_person(ana), "post", url, {"base_cm": 100})  # the oldest, expires in 10 min
    for _ in range(5):
        send(as_person(ana), "post", url, {"base_cm": 100})
    response = send(as_person(ana), "post", url, {"base_cm": 100})
    assert response.status_code == 429 and response.json()["code"] == "rate_limited"
    assert response["Retry-After"] == "600"


# --- 2. PATCH position null ------------------------------------------------------------------


def test_patching_position_to_null_is_a_400(as_person, catedral, crew_a, ana):
    trip = make_trip(crew_a, resorts=[catedral])
    url = f"/api/trips/{trip.pk}/ski/resorts/{catedral.pk}"
    response = send(as_person(ana), "patch", url, {"position": None})
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"
    assert send(as_person(ana), "patch", url, {"nights": 2}).status_code == 200


# --- 5. a pass must be for a resort of the trip -----------------------------------------------


def test_a_pass_for_a_resort_outside_the_trip_is_400(as_person, catedral, crew_a, ana):
    elsewhere = make_resort("valle-nevado", name="Valle Nevado")
    trip = make_trip(crew_a, resorts=[catedral])
    url = f"/api/trips/{trip.pk}/ski/passes/me"
    response = send(
        as_person(ana), "put", url, {"resort_id": str(elsewhere.pk), "status": "bought"}
    )
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"
    assert not LiftPass.objects.exists()
    ok = send(as_person(ana), "put", url, {"resort_id": str(catedral.pk), "status": "bought"})
    assert ok.status_code == 200
