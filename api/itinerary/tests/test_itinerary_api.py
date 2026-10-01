from datetime import date

import pytest
from django.test import Client

from itinerary.tests.conftest import send

pytestmark = pytest.mark.django_db


def path(trip, suffix=""):
    return f"/api/trips/{trip.id}/itinerary{suffix}"


def create(c, trip, **data):
    r = send(c, "post", path(trip, "/entries"), dict(title="Walk") | data)
    assert r.status_code == 201, r.content
    return r.json()


def test_virtual_days_lazy_rows_and_tray(trip, ana, client_as):
    c = client_as(ana)
    result = c.get(path(trip))
    assert result.status_code == 200
    assert len(result.json()["days"]) == 3
    assert all(d["is_virtual"] for d in result.json()["days"])
    e = create(c, trip)
    assert e["day_date"] is None
    result = send(c, "put", path(trip, "/days/2026-10-01"), {"title": "First"})
    assert result.status_code == 200
    assert result.json()["is_virtual"] is False


def test_local_times_and_move_to_tray(trip, ana, client_as):
    c = client_as(ana)
    e = create(c, trip, day_date="2026-10-01", start_time="09:00", end_time="10:00")
    assert e["starts_at"].startswith("2026-10-01T12:00:00")
    assert e["start_time"] == "09:00"
    response = send(c, "patch", f"/api/itinerary_entries/{e['id']}", {"day_date": None})
    assert response.status_code == 200
    assert response.json()["starts_at"] is None
    assert response.json()["ends_at"] is None


@pytest.mark.parametrize(
    "data,code",
    [
        ({"day_date": "2026-09-30"}, "day_out_of_range"),
        ({"start_time": "09:00"}, "invalid_times"),
        ({"day_date": "2026-10-01", "start_time": "10:00", "end_time": "09:00"}, "invalid_times"),
        ({"title": " "}, "invalid_request"),
        ({"lat": 91}, "invalid_request"),
    ],
)
def test_validation(trip, ana, client_as, data, code):
    result = send(client_as(ana), "post", path(trip, "/entries"), {"title": "Walk"} | data)
    assert result.status_code == 400
    assert result.json()["code"] == code


def test_entries_become_out_of_range_not_deleted(trip, ana, client_as):
    c = client_as(ana)
    create(c, trip, day_date="2026-10-01")
    trip.start_on = date(2026, 10, 2)
    trip.save()
    result = c.get(path(trip)).json()
    assert len(result["out_of_range"]) == 1
    assert len(result["days"]) == 2


def test_auth_and_csrf(trip, ana, outsider, client_as):
    assert Client().get(path(trip)).status_code == 401
    assert client_as(outsider).get(path(trip)).status_code == 404
    e = create(client_as(ana), trip)
    for verb, suffix in [("patch", ""), ("delete", ""), ("post", "/move")]:
        assert (
            send(
                client_as(outsider),
                verb,
                f"/api/itinerary_entries/{e['id']}{suffix}",
                {"direction": "up"},
            ).status_code
            == 404
        )
    assert (
        send(client_as(ana, True), "post", path(trip, "/entries"), {"title": "Walk"}).status_code
        == 403
    )


def test_notes_cap_and_delete_permissions(trip, ana, beto, client_as, crew):
    c = client_as(ana)
    url = f"/api/trips/{trip.id}/notes"
    ids = []
    for i in range(5):
        r = send(c, "post", url, {"body": f"Note {i}", "pinned": True})
        assert r.status_code == 201, r.content
        ids.append(r.json()["id"])
    assert send(c, "post", url, {"body": "six", "pinned": True}).json()["code"] == "too_many_pinned"
    assert send(client_as(beto), "delete", f"/api/notes/{ids[0]}").status_code == 403
    from crews.models import CrewMembership

    CrewMembership.objects.filter(crew=crew, person=ana).update(status="removed")
    assert send(client_as(beto), "delete", f"/api/notes/{ids[0]}").status_code == 204


def test_move_within_class_and_reject_different_time(trip, ana, client_as):
    c = client_as(ana)
    a = create(c, trip, day_date="2026-10-01", start_time="09:00")
    b = create(c, trip, day_date="2026-10-01", start_time="10:00")
    r = send(c, "post", f"/api/itinerary_entries/{a['id']}/move", {"direction": "down"})
    assert r.status_code == 409
    assert r.json()["code"] == "cannot_reorder_timed"
    u = create(c, trip, title="Untimed A")
    v = create(c, trip, title="Untimed B")
    r = send(c, "post", f"/api/itinerary_entries/{v['id']}/move", {"direction": "up"})
    assert r.status_code == 200
    assert r.json()["date"] is None
    assert [e["id"] for e in r.json()["entries"]] == [v["id"], u["id"]]
    assert (
        send(c, "post", f"/api/itinerary_entries/{v['id']}/move", {"direction": "up"}).json()[
            "code"
        ]
        == "at_edge"
    )
    assert send(c, "delete", f"/api/itinerary_entries/{b['id']}").status_code == 204
