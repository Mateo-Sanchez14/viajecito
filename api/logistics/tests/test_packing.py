import pytest

from logistics.tests.conftest import send

pytestmark = pytest.mark.django_db


def test_apply_idempotent_and_private(trip, ana, beto, as_person):
    client = as_person(ana)
    root = f"/api/trips/{trip.id}/packing/me"
    assert client.get(root).status_code == 200
    applied = send(client, "post", root + "/apply", {"template_key": "generic"})
    assert applied.status_code == 200
    row = applied.json()
    assert row["progress"]["total"] > 5 and row["applied"] == ["generic"]
    entry = row["sections"][0]["entries"][0]
    edited = send(
        client,
        "patch",
        f"/api/packing_entries/{entry['id']}",
        {"packed": True, "label": "My label"},
    )
    assert edited.status_code == 200
    again = send(client, "post", root + "/apply", {"template_key": "generic"}).json()
    assert (
        again["progress"]["total"] == row["progress"]["total"] and again["progress"]["packed"] == 1
    )
    assert (
        send(
            as_person(beto), "patch", f"/api/packing_entries/{entry['id']}", {"packed": False}
        ).status_code
        == 404
    )
    assert (
        send(client, "post", root + "/apply", {"template_key": "invalid"}).json()["code"]
        == "unknown_template"
    )


def test_ski_border_and_custom_summary(trip, ana, beto, as_person):
    trip.type = "ski"
    trip.save()
    client = as_person(ana)
    root = f"/api/trips/{trip.id}/packing/me"
    keys = [t["key"] for t in client.get(root).json()["templates_available"]]
    assert set(keys) == {"generic", "ski", "border"}
    for key in keys:
        assert send(client, "post", root + "/apply", {"template_key": key}).status_code == 200
    entry = send(client, "post", root + "/entries", {"label": "Guitar"}).json()
    assert entry["section"] == "custom"
    assert (
        send(client, "patch", f"/api/packing_entries/{entry['id']}", {"packed": True}).status_code
        == 200
    )
    summary = client.get(f"/api/trips/{trip.id}/packing/summary").json()
    assert summary[0]["person"]["person_id"] == str(ana.id) and summary[0]["packed"] == 1
    assert "entries" not in summary[0]
    assert send(client, "delete", f"/api/packing_entries/{entry['id']}").status_code == 204
