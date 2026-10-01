from datetime import date

import pytest

from decisions.adapters import trips_gateway
from decisions.models import Decision
from decisions.tests.conftest import open_payload, send

pytestmark = pytest.mark.django_db

EXPLICIT = {"start_on": "2026-07-03", "end_on": "2026-07-09"}


@pytest.fixture
def decision(as_person, ana, trip):
    return send(as_person(ana), "post", f"/api/trips/{trip.pk}/decisions", open_payload()).json()


def vote(client, decision, days, answer="yes"):
    body = {"answers": [{"date": d, "answer": answer} for d in days]}
    send(client, "put", f"/api/decisions/{decision['id']}/availability", body)


def close(client, decision, payload=None):
    return send(client, "post", f"/api/decisions/{decision['id']}/close", payload or {})


def test_closing_defaults_to_the_best_window_and_writes_the_trip_dates(
    as_person, ana, beto, trip, decision
):
    days = [f"2026-07-{d:02d}" for d in range(14, 21)]
    vote(as_person(ana), decision, days)
    vote(as_person(beto), decision, days)
    response = close(as_person(beto), decision)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "closed" and body["outcome_start"] == "2026-07-14"
    assert body["outcome_end"] == "2026-07-20" and body["closed_at"]
    assert body["closed_by"] == {"person_id": str(beto.pk), "display_name": "Beto"}
    trip.refresh_from_db()
    assert (trip.start_on, trip.end_on) == (date(2026, 7, 14), date(2026, 7, 20))


def test_explicit_dates_inside_the_window_win_over_the_best_window(as_person, ana, trip, decision):
    vote(as_person(ana), decision, ["2026-07-14"])
    response = close(as_person(ana), decision, {"start_on": "2026-07-20", "end_on": "2026-07-22"})
    assert response.status_code == 200
    trip.refresh_from_db()
    assert (trip.start_on, trip.end_on) == (date(2026, 7, 20), date(2026, 7, 22))


@pytest.mark.parametrize(
    "payload",
    [
        {"start_on": "2026-06-30", "end_on": "2026-07-05"},  # starts before the window
        {"start_on": "2026-07-28", "end_on": "2026-08-02"},  # ends after the window
        {"start_on": "2026-07-10", "end_on": "2026-07-09"},  # reversed
        {"start_on": "2026-07-10"},  # half a pair
    ],
)
def test_invalid_explicit_dates_are_rejected(as_person, ana, trip, decision, payload):
    response = close(as_person(ana), decision, payload)
    assert response.status_code == 400 and response.json()["code"] == "invalid_window"
    trip.refresh_from_db()
    assert trip.start_on is None
    assert Decision.objects.get().status == "open"


def test_closing_a_closed_decision_is_a_409(as_person, ana, decision):
    close(as_person(ana), decision, EXPLICIT)
    again = close(as_person(ana), decision, EXPLICIT)
    assert again.status_code == 409 and again.json()["code"] == "decision_closed"


def test_closing_overwrites_existing_trip_dates(as_person, ana, trip, decision):
    trip.start_on, trip.end_on = date(2026, 9, 1), date(2026, 9, 5)
    trip.save()
    close(as_person(ana), decision, {"start_on": "2026-07-03", "end_on": "2026-07-09"})
    trip.refresh_from_db()
    assert (trip.start_on, trip.end_on) == (date(2026, 7, 3), date(2026, 7, 9))


def test_the_trip_update_runs_in_the_closing_transaction(
    as_person, ana, trip, decision, monkeypatch
):
    def boom(*args, **kwargs):
        raise RuntimeError("trips is down")

    monkeypatch.setattr(trips_gateway, "update_trip", boom)
    client = as_person(ana)
    client.raise_request_exception = False
    response = close(client, decision, EXPLICIT)
    assert response.status_code == 500
    row = Decision.objects.get()
    assert row.status == "open" and row.outcome_start is None and row.closed_by_id is None


def test_the_trip_update_receives_the_chosen_window_and_the_actor(
    as_person, ana, beto, decision, monkeypatch
):
    calls = []
    monkeypatch.setattr(trips_gateway, "update_trip", lambda *a, **kw: calls.append((a, kw)))
    close(as_person(beto), decision, {"start_on": "2026-07-03", "end_on": "2026-07-09"})
    assert calls == [
        (
            (str(Decision.objects.get().trip_id), str(beto.pk)),
            {"start_on": date(2026, 7, 3), "end_on": date(2026, 7, 9)},
        )
    ]


def test_reopening_clears_the_outcome_and_leaves_the_trip_dates(as_person, ana, trip, decision):
    client = as_person(ana)
    close(client, decision, {"start_on": "2026-07-03", "end_on": "2026-07-09"})
    response = send(client, "post", f"/api/decisions/{decision['id']}/reopen")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "open" and body["outcome_start"] is None and body["closed_by"] is None
    assert body["closed_at"] is None
    trip.refresh_from_db()
    assert (trip.start_on, trip.end_on) == (date(2026, 7, 3), date(2026, 7, 9))


def test_reopening_an_open_decision_is_a_409(as_person, ana, decision):
    response = send(as_person(ana), "post", f"/api/decisions/{decision['id']}/reopen")
    assert response.status_code == 409 and response.json()["code"] == "decision_open"


def test_reopening_while_another_decision_is_open_is_a_409(as_person, ana, trip, decision):
    client = as_person(ana)
    close(client, decision, EXPLICIT)
    send(client, "post", f"/api/trips/{trip.pk}/decisions", open_payload())
    response = send(client, "post", f"/api/decisions/{decision['id']}/reopen")
    assert response.status_code == 409 and response.json()["code"] == "decision_already_open"
    assert Decision.objects.get(pk=decision["id"]).status == "closed"


def test_closing_without_any_answers_and_without_dates_is_a_no_window_error(
    as_person, ana, trip, decision
):
    response = close(as_person(ana), decision)
    assert response.status_code == 400 and response.json()["code"] == "no_window"
    trip.refresh_from_db()
    assert trip.start_on is None and Decision.objects.get().status == "open"


def test_closing_with_explicit_dates_needs_no_answers(as_person, ana, trip, decision):
    response = close(as_person(ana), decision, {"start_on": "2026-07-03", "end_on": "2026-07-09"})
    assert response.status_code == 200


def test_a_non_member_cannot_close_or_reopen(as_person, ana, stranger, trip, decision):
    explicit = {"start_on": "2026-07-03", "end_on": "2026-07-09"}
    assert close(as_person(stranger), decision, explicit).status_code == 404
    assert Decision.objects.get().status == "open"
    close(as_person(ana), decision, explicit)
    reopened = send(as_person(stranger), "post", f"/api/decisions/{decision['id']}/reopen")
    assert reopened.status_code == 404
    assert Decision.objects.get().status == "closed"
