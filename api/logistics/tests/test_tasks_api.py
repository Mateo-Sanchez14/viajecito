import pytest
from django.test import Client

from logistics.tests.conftest import send

pytestmark = pytest.mark.django_db


def create(client, trip, **fields):
    return send(client, "post", f"/api/trips/{trip.id}/tasks", {"title": "Book cabin", **fields})


def test_crud_and_number_never_reused(trip, ana, as_person):
    client = as_person(ana)
    first = create(client, trip)
    assert first.status_code == 201
    row = first.json()
    assert row["number"] == 1
    assert send(client, "delete", f"/api/tasks/{row['id']}").status_code == 204
    second = create(client, trip).json()
    assert second["number"] == 2
    done = send(client, "patch", f"/api/tasks/{second['id']}", {"status": "done"}).json()
    assert done["done_by"]["person_id"] == str(ana.id) and done["done_at"]
    reopened = send(client, "patch", f"/api/tasks/{second['id']}", {"status": "open"}).json()
    assert reopened["done_by"] is None and reopened["done_at"] is None


def test_access_filters_owner(trip, ana, beto, stranger, as_person, anon):
    url = f"/api/trips/{trip.id}/tasks"
    assert anon.get(url).status_code == 401
    assert as_person(stranger).get(url).status_code == 404
    client = as_person(ana)
    assert create(client, trip, owner_id=str(stranger.id)).json()["code"] == "invalid_owner"
    assert create(client, trip, owner_id=str(beto.id), kind="bring", quantity=2).status_code == 201
    assert client.get(url, {"owner": "me"}).json() == []
    assert len(client.get(url, {"owner": str(beto.id), "kind": "bring"}).json()) == 1
    assert create(client, trip, kind="bring", quantity=0).status_code == 400


def test_csrf(trip, ana):
    client = Client(enforce_csrf_checks=True)
    client.force_login(ana)
    assert create(client, trip).status_code == 403


@pytest.mark.parametrize(
    "changes", [{"title": None}, {"notes": None}, {"kind": None}, {"status": None}]
)
def test_null_nonnullable_fields_rejected(trip, ana, as_person, changes):
    client = as_person(ana)
    task = create(client, trip).json()
    assert send(client, "patch", f"/api/tasks/{task['id']}", changes).status_code == 400


def test_owner_change_resets_nudges(trip, ana, beto, as_person):
    from logistics.models import Task

    client = as_person(ana)
    task = create(client, trip, owner_id=str(ana.id)).json()
    Task.objects.filter(pk=task["id"]).update(nudge_count=3)
    changed = send(client, "patch", f"/api/tasks/{task['id']}", {"owner_id": str(beto.id)}).json()
    assert changed["nudge_count"] == 0


def test_order_repeatable_filters_and_foreign_task(trip, ana, beto, stranger, as_person):
    client = as_person(ana)
    one = create(client, trip, due_on="2020-01-01").json()
    two = create(client, trip).json()
    send(client, "patch", f"/api/tasks/{one['id']}", {"status": "done"})
    rows = client.get(f"/api/trips/{trip.id}/tasks", {"status": ["open", "done"]}).json()
    assert [r["id"] for r in rows] == [two["id"], one["id"]]
    assert (
        send(
            as_person(stranger), "patch", f"/api/tasks/{one['id']}", {"title": "intrusion"}
        ).status_code
        == 404
    )
    assert (
        send(client, "patch", f"/api/tasks/{one['id']}", {"status": "blocked"}).status_code == 400
    )


def test_open_first_even_when_blocked_earlier(trip, ana, as_person):
    client = as_person(ana)
    blocked = create(client, trip, due_on="2020-01-01").json()
    send(client, "patch", f"/api/tasks/{blocked['id']}", {"status": "blocked"})
    opened = create(client, trip).json()
    assert client.get(f"/api/trips/{trip.pk}/tasks").json()[0]["id"] == opened["id"]


def test_same_owner_patch_preserves_nudge_history(trip, ana, as_person):
    from datetime import UTC, datetime

    from logistics.models import Task

    client = as_person(ana)
    task = create(client, trip, owner_id=str(ana.id)).json()
    last_nudged = datetime(2026, 10, 1, 15, tzinfo=UTC)
    Task.objects.filter(pk=task["id"]).update(nudge_count=3, last_nudged_at=last_nudged)
    response = send(client, "patch", f"/api/tasks/{task['id']}", {"owner_id": str(ana.id)})
    assert response.status_code == 200
    persisted = Task.objects.get(pk=task["id"])
    assert persisted.nudge_count == 3
    assert persisted.last_nudged_at == last_nudged
