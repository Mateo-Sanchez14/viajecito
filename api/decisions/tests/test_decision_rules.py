import uuid
from datetime import date
from decimal import Decimal

import pytest
from django.test import Client

from decisions.models import Decision
from decisions.tests.conftest import open_payload, send

pytestmark = pytest.mark.django_db


def create(client, trip, **overrides):
    return send(client, "post", f"/api/trips/{trip.pk}/decisions", open_payload(**overrides))


def test_a_member_opens_a_dates_decision(as_person, ana, trip):
    response = create(as_person(ana), trip, max_days=10, deadline="2026-06-20T15:00:00Z")
    assert response.status_code == 201
    body = response.json()
    assert body["trip_id"] == str(trip.pk) and body["kind"] == "dates" and body["status"] == "open"
    assert (body["window_start"], body["window_end"]) == ("2026-07-01", "2026-07-31")
    assert (body["min_days"], body["max_days"]) == (7, 10)
    assert body["maybe_weight"] == "0.50" and body["deadline"].startswith("2026-06-20T15:00:00")
    assert body["opened_by"] == {"person_id": str(ana.pk), "display_name": "Ana"}
    assert body["closed_by"] is None and body["outcome_start"] is None and body["closed_at"] is None
    assert (body["respondents"], body["eligible"]) == (0, 1)


def test_max_days_defaults_to_min_days_and_maybe_weight_is_stored(as_person, ana, trip):
    body = create(as_person(ana), trip, maybe_weight="0.25").json()
    assert body["max_days"] == 7 and body["maybe_weight"] == "0.25"


def test_only_one_open_dates_decision_per_trip(as_person, ana, trip):
    assert create(as_person(ana), trip).status_code == 201
    second = create(as_person(ana), trip)
    assert second.status_code == 409 and second.json()["code"] == "decision_already_open"


@pytest.mark.parametrize(
    "overrides",
    [
        {"window_end": "2026-06-30"},  # end before start
        {"window_end": "2027-01-31"},  # span > 180 days
        {"min_days": 10, "max_days": 5},  # max < min
        {"min_days": 40},  # min > span (31 days)
        {"min_days": 0},
        {"min_days": 61, "window_end": "2026-12-01", "max_days": 61},
        {"maybe_weight": "1.5"},
    ],
)
def test_invalid_windows_are_rejected(as_person, ana, trip, overrides):
    response = create(as_person(ana), trip, **overrides)
    assert response.status_code == 400
    assert response.json()["code"] in {"invalid_window", "invalid_request"}
    assert not Decision.objects.exists()


def test_semantic_window_errors_use_invalid_window(as_person, ana, trip):
    for overrides in (
        {"window_end": "2026-06-30"},
        {"min_days": 10, "max_days": 5},
        {"min_days": 40},
    ):
        assert create(as_person(ana), trip, **overrides).json()["code"] == "invalid_window"


def test_a_range_of_exactly_180_days_is_accepted(as_person, ana, trip):
    assert create(as_person(ana), trip, window_end="2026-12-27").status_code == 201  # 180 days
    Decision.objects.all().delete()
    assert create(as_person(ana), trip, window_end="2026-12-28").status_code == 400  # 181


def test_unknown_kind_and_naive_deadline_are_invalid_requests(as_person, ana, trip):
    client = as_person(ana)
    assert create(client, trip, kind="lodging").json()["code"] == "invalid_request"
    assert create(client, trip, deadline="2026-06-20T15:00:00").json()["code"] == "invalid_request"


def test_list_filters_by_status_and_is_newest_first(as_person, ana, trip):
    client = as_person(ana)
    first = create(client, trip).json()
    explicit = {"start_on": "2026-07-03", "end_on": "2026-07-09"}
    send(client, "post", f"/api/decisions/{first['id']}/close", explicit)
    second = create(client, trip, window_start="2026-08-01", window_end="2026-08-31").json()
    listing = client.get(f"/api/trips/{trip.pk}/decisions").json()
    assert [d["id"] for d in listing] == [second["id"], first["id"]]
    only_open = client.get(f"/api/trips/{trip.pk}/decisions", {"status": "open"}).json()
    assert [d["id"] for d in only_open] == [second["id"]]
    assert client.get(f"/api/trips/{trip.pk}/decisions", {"status": "bogus"}).status_code == 400


def test_get_decision(as_person, ana, trip):
    created = create(as_person(ana), trip).json()
    response = as_person(ana).get(f"/api/decisions/{created['id']}")
    assert response.status_code == 200 and response.json() == created


def test_patch_updates_fields_and_keeps_answers_outside_a_narrowed_window(as_person, ana, trip):
    client = as_person(ana)
    created = create(client, trip).json()
    send(
        client,
        "put",
        f"/api/decisions/{created['id']}/availability",
        {"answers": [{"date": "2026-07-25", "answer": "yes"}]},
    )
    patched = send(
        client,
        "patch",
        f"/api/decisions/{created['id']}",
        {"window_end": "2026-07-20", "min_days": 3, "deadline": None},
    )
    assert patched.status_code == 200
    assert patched.json()["window_end"] == "2026-07-20" and patched.json()["min_days"] == 3
    assert patched.json()["max_days"] == 7  # untouched
    from decisions.models import AvailabilityResponse

    assert AvailabilityResponse.objects.filter(date=date(2026, 7, 25)).exists()


def test_patch_validates_the_merged_window(as_person, ana, trip):
    created = create(as_person(ana), trip).json()
    response = send(as_person(ana), "patch", f"/api/decisions/{created['id']}", {"min_days": 9})
    assert response.status_code == 400 and response.json()["code"] == "invalid_window"  # 9 > max 7


def test_patching_a_closed_decision_is_a_409(as_person, ana, trip):
    client = as_person(ana)
    created = create(client, trip).json()
    explicit = {"start_on": "2026-07-03", "end_on": "2026-07-09"}
    send(client, "post", f"/api/decisions/{created['id']}/close", explicit)
    response = send(client, "patch", f"/api/decisions/{created['id']}", {"min_days": 3})
    assert response.status_code == 409 and response.json()["code"] == "decision_closed"


def test_non_members_anonymous_and_csrf(as_person, anon, ana, stranger, trip):
    created = create(as_person(ana), trip).json()
    decision_url = f"/api/decisions/{created['id']}"
    trip_url = f"/api/trips/{trip.pk}/decisions"
    for url in (trip_url, decision_url, f"{decision_url}/availability"):
        assert as_person(stranger).get(url).status_code == 404
        assert as_person(stranger).get(url).json()["code"] == "not_found"
        assert anon.get(url).status_code == 401
    assert create(as_person(stranger), trip).status_code == 404
    assert send(as_person(stranger), "patch", decision_url, {"min_days": 3}).status_code == 404
    assert send(as_person(stranger), "post", f"{decision_url}/close", {}).status_code == 404
    assert as_person(ana).get(f"/api/decisions/{uuid.uuid4()}").status_code == 404
    strict = Client(enforce_csrf_checks=True)
    strict.force_login(ana)
    denied = send(strict, "post", trip_url, open_payload())
    assert denied.status_code == 403 and denied.json()["code"] == "csrf_failed"


def test_patch_rejects_kind(as_person, ana, trip):
    created = create(as_person(ana), trip).json()
    response = send(as_person(ana), "patch", f"/api/decisions/{created['id']}", {"kind": "dates"})
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"


@pytest.mark.parametrize("weight", ["0.555", "0.001", "0.5000001"])
def test_maybe_weight_is_never_silently_rounded(as_person, ana, trip, weight):
    response = create(as_person(ana), trip, maybe_weight=weight)
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"
    created = create(as_person(ana), trip).json()
    patched = send(
        as_person(ana), "patch", f"/api/decisions/{created['id']}", {"maybe_weight": weight}
    )
    assert patched.status_code == 400 and patched.json()["code"] == "invalid_request"
    assert Decision.objects.get().maybe_weight == Decimal("0.50")


def test_two_decimal_weights_are_accepted(as_person, ana, trip):
    assert create(as_person(ana), trip, maybe_weight="0.55").json()["maybe_weight"] == "0.55"
