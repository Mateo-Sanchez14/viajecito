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


@pytest.mark.parametrize("field", ["title", "kind", "location_label", "is_meeting_point", "notes"])
def test_nonnullable_entry_fields_reject_null(trip, ana, client_as, field):
    c = client_as(ana)
    e = create(c, trip)
    r = send(c, "patch", f"/api/itinerary_entries/{e['id']}", {field: None})
    assert r.status_code == 400
    assert r.json()["code"] == "invalid_request"


def test_same_time_reorder_then_delete_compacts_positions(trip, ana, client_as):
    c = client_as(ana)
    one = create(c, trip, title="One", day_date="2026-10-01", start_time="09:00")
    two = create(c, trip, title="Two", day_date="2026-10-01", start_time="09:00")
    three = create(c, trip, title="Three", day_date="2026-10-01")
    r = send(c, "post", f"/api/itinerary_entries/{two['id']}/move", {"direction": "up"})
    assert r.status_code == 200
    assert [e["id"] for e in r.json()["entries"]] == [two["id"], one["id"], three["id"]]
    assert [e["position"] for e in r.json()["entries"]] == [0, 1, 2]
    assert send(c, "delete", f"/api/itinerary_entries/{one['id']}").status_code == 204
    day = c.get(path(trip)).json()["days"][0]
    assert [e["position"] for e in day["entries"]] == [0, 1]


def test_partial_day_updates_preserve_other_fields(trip, ana, client_as):
    c = client_as(ana)
    url = path(trip, "/days/2026-10-01")
    assert send(c, "put", url, {"title": "Day one", "notes": "Original"}).status_code == 200
    assert send(c, "put", url, {"title": "Changed"}).json()["notes"] == "Original"
    trip.start_on = trip.end_on = None
    trip.save()
    assert send(c, "put", url, {"title": "No dates"}).json()["code"] == "day_out_of_range"


def test_note_edit_pin_cap_and_listing_order(trip, ana, beto, client_as):
    c = client_as(ana)
    url = f"/api/trips/{trip.id}/notes"
    pinned = [send(c, "post", url, {"body": str(i), "pinned": True}).json() for i in range(5)]
    recent = send(c, "post", url, {"body": "Recent"}).json()
    assert (
        send(c, "patch", f"/api/notes/{recent['id']}", {"pinned": True}).json()["code"]
        == "too_many_pinned"
    )
    assert (
        send(
            client_as(beto),
            "patch",
            f"/api/notes/{pinned[0]['id']}",
            {"body": "Edited", "pinned": False},
        ).status_code
        == 200
    )
    assert send(c, "patch", f"/api/notes/{recent['id']}", {"pinned": True}).status_code == 200
    results = c.get(url).json()
    assert all(n["pinned"] for n in results[:5])
    assert not results[-1]["pinned"]
    assert len(c.get(url + "?pinned=true").json()) == 5
    assert len(c.get(url + "?pinned=false").json()) == 1


def test_member_and_outsider_note_authorization(trip, ana, outsider, client_as):
    c = client_as(ana)
    url = f"/api/trips/{trip.id}/notes"
    n = send(c, "post", url, {"body": "Private"}).json()
    other = client_as(outsider)
    assert other.get(url).status_code == 404
    assert send(other, "post", url, {"body": "Attack"}).status_code == 404
    assert send(other, "patch", f"/api/notes/{n['id']}", {"body": "Attack"}).status_code == 404
    assert send(other, "delete", f"/api/notes/{n['id']}").status_code == 404
    assert send(c, "delete", f"/api/notes/{n['id']}").status_code == 204
