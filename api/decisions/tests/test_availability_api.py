from datetime import date

import pytest
from django.test import Client

from decisions.models import AvailabilityResponse
from decisions.tests.conftest import open_payload, rsvp, send

pytestmark = pytest.mark.django_db


@pytest.fixture
def decision(as_person, ana, trip):
    response = send(as_person(ana), "post", f"/api/trips/{trip.pk}/decisions", open_payload())
    return response.json()


def put(client, decision, *answers):
    body = {"answers": [{"date": day, "answer": answer} for day, answer in answers]}
    return send(client, "put", f"/api/decisions/{decision['id']}/availability", body)


def test_a_member_saves_their_answers_and_gets_the_grid_back(as_person, ana, beto, decision):
    response = put(as_person(beto), decision, ("2026-07-10", "yes"), ("2026-07-11", "maybe"))
    assert response.status_code == 200
    body = response.json()
    assert body["me"] == str(beto.pk)
    assert len(body["dates"]) == 31 and body["dates"][0] == "2026-07-01"
    rows = {p["person_id"]: p for p in body["people"]}
    assert rows[str(beto.pk)]["answers"] == {"2026-07-10": "yes", "2026-07-11": "maybe"}
    assert rows[str(ana.pk)]["answers"] == {}
    assert rows[str(beto.pk)]["display_name"] == "Beto" and rows[str(beto.pk)]["rsvp"] == "pending"
    assert body["has_data"] is True
    assert [p["person_id"] for p in body["non_responders"]] == [str(ana.pk)]
    assert (body["decision"]["respondents"], body["decision"]["eligible"]) == (1, 2)


def test_get_returns_the_same_board(as_person, beto, decision):
    put(as_person(beto), decision, ("2026-07-10", "yes"))
    body = as_person(beto).get(f"/api/decisions/{decision['id']}/availability").json()
    assert any(p["answers"] == {"2026-07-10": "yes"} for p in body["people"])
    assert body["best_windows"] and body["best_windows"][0]["days"] == 7


def test_null_clears_a_day_and_repeated_dates_keep_the_last(as_person, beto, decision):
    client = as_person(beto)
    put(client, decision, ("2026-07-10", "yes"), ("2026-07-11", "no"))
    response = put(
        client, decision, ("2026-07-10", None), ("2026-07-11", "yes"), ("2026-07-11", "maybe")
    )
    mine = next(p for p in response.json()["people"] if p["person_id"] == str(beto.pk))
    assert mine["answers"] == {"2026-07-11": "maybe"}
    assert AvailabilityResponse.objects.filter(person=beto).count() == 1


def test_i_can_only_write_my_own_answers(as_person, ana, beto, decision):
    body = {"answers": [{"date": "2026-07-10", "answer": "yes", "person_id": str(ana.pk)}]}
    response = send(as_person(beto), "put", f"/api/decisions/{decision['id']}/availability", body)
    assert response.status_code == 200
    assert AvailabilityResponse.objects.get().person_id == beto.pk  # the extra field is ignored


def test_out_of_range_dates_are_rejected_and_nothing_is_written(as_person, beto, decision):
    response = put(as_person(beto), decision, ("2026-07-10", "yes"), ("2026-08-01", "yes"))
    assert response.status_code == 400 and response.json()["code"] == "date_out_of_range"
    assert not AvailabilityResponse.objects.exists()


@pytest.mark.parametrize(
    "body",
    [
        {"answers": []},
        {"answers": [{"date": "2026-07-10", "answer": "perhaps"}]},
        {"answers": [{"date": "nope", "answer": "yes"}]},
        {"answers": [{"date": "2026-07-10", "answer": "yes"}] * 367},
        {},
    ],
)
def test_malformed_bodies_are_invalid_requests(as_person, beto, decision, body):
    response = send(as_person(beto), "put", f"/api/decisions/{decision['id']}/availability", body)
    assert response.status_code == 400 and response.json()["code"] == "invalid_request"


def test_exactly_366_answers_are_accepted(as_person, beto, decision):
    items = [{"date": "2026-07-10", "answer": "yes"}] * 366
    response = send(
        as_person(beto), "put", f"/api/decisions/{decision['id']}/availability", {"answers": items}
    )
    assert response.status_code == 200


def test_a_closed_decision_takes_no_answers(as_person, ana, beto, decision):
    explicit = {"start_on": "2026-07-03", "end_on": "2026-07-09"}
    send(as_person(ana), "post", f"/api/decisions/{decision['id']}/close", explicit)
    response = put(as_person(beto), decision, ("2026-07-10", "yes"))
    assert response.status_code == 409 and response.json()["code"] == "decision_closed"


def test_only_members_respond(as_person, anon, stranger, decision):
    assert put(as_person(stranger), decision, ("2026-07-10", "yes")).status_code == 404
    assert put(anon, decision, ("2026-07-10", "yes")).status_code == 401
    assert not AvailabilityResponse.objects.exists()


def test_csrf_is_required_for_writes(ana, beto, decision):
    strict = Client(enforce_csrf_checks=True)
    strict.force_login(beto)
    response = put(strict, decision, ("2026-07-10", "yes"))
    assert response.status_code == 403 and response.json()["code"] == "csrf_failed"


def test_out_participants_are_not_eligible(as_person, ana, beto, cleo, trip, decision):
    rsvp(trip, cleo, "out")
    put(as_person(cleo), decision, ("2026-07-10", "no"))
    body = as_person(ana).get(f"/api/decisions/{decision['id']}/availability").json()
    assert {p["person_id"] for p in body["people"]} == {str(ana.pk), str(beto.pk)}
    assert body["decision"]["eligible"] == 2
    assert str(cleo.pk) not in [p["person_id"] for p in body["non_responders"]]
    assert body["has_data"] is False  # cleo's answer does not count
    assert all(w["no_count"] == 0 for w in body["best_windows"])


def test_an_out_participant_still_sees_and_edits_their_own_row(
    as_person, ana, cleo, trip, decision
):
    rsvp(trip, cleo, "out")
    response = put(as_person(cleo), decision, ("2026-07-10", "yes"))
    mine = next(p for p in response.json()["people"] if p["person_id"] == str(cleo.pk))
    assert mine["rsvp"] == "out" and mine["answers"] == {"2026-07-10": "yes"}
    assert response.json()["decision"]["eligible"] == 1  # only ana


def test_answers_survive_a_narrowed_window_but_are_not_shown(as_person, ana, beto, decision):
    put(as_person(beto), decision, ("2026-07-25", "yes"), ("2026-07-05", "yes"))
    send(as_person(ana), "patch", f"/api/decisions/{decision['id']}", {"window_end": "2026-07-20"})
    body = as_person(ana).get(f"/api/decisions/{decision['id']}/availability").json()
    mine = next(p for p in body["people"] if p["person_id"] == str(beto.pk))
    assert mine["answers"] == {"2026-07-05": "yes"}
    assert AvailabilityResponse.objects.filter(date=date(2026, 7, 25)).exists()


def test_answers_belong_to_the_trip_so_they_survive_reopening(as_person, ana, beto, decision):
    put(as_person(beto), decision, ("2026-07-10", "yes"))
    send(as_person(ana), "post", f"/api/decisions/{decision['id']}/close", {})
    send(as_person(ana), "post", f"/api/decisions/{decision['id']}/reopen", {})
    body = as_person(ana).get(f"/api/decisions/{decision['id']}/availability").json()
    assert any(p["answers"] == {"2026-07-10": "yes"} for p in body["people"])


def test_best_windows_rank_the_group_answers(as_person, ana, beto, decision):
    days = [f"2026-07-{d:02d}" for d in range(14, 21)]
    put(as_person(ana), decision, *[(d, "yes") for d in days])
    put(as_person(beto), decision, *[(d, "yes") for d in days])
    top = (
        as_person(ana)
        .get(f"/api/decisions/{decision['id']}/availability")
        .json()["best_windows"][0]
    )
    assert (top["start"], top["end"]) == ("2026-07-14", "2026-07-20")
    assert top["avg_score"] == 2.0 and sorted(top["full_people"]) == sorted(
        [str(ana.pk), str(beto.pk)]
    )
    assert top["no_count"] == 0 and top["missing_people"] == [] and top["blocked_people"] == []
