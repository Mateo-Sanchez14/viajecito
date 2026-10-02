import hashlib
import json
from datetime import UTC, datetime

import pytest

from itinerary.tests.conftest import send
from shared.clock import FrozenClock

pytestmark = pytest.mark.django_db


def test_etag_304_stable_within_minute_and_updates_on_note(trip, ana, client_as, monkeypatch):
    clock = FrozenClock(datetime(2026, 10, 1, 12, 0, 1, tzinfo=UTC))
    monkeypatch.setattr("itinerary.api.clock", clock, raising=False)
    c = client_as(ana)
    url = f"/api/trips/{trip.id}/today"
    response = c.get(url)
    assert response.status_code == 200, response.content
    data = response.json()
    assert data["mode"] == "during"
    assert data["local_time"] == "09:00"
    assert response["Cache-Control"] == "private, no-cache"
    generated = data.pop("generated_at")
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    etag = f'W/"{hashlib.sha256(canonical.encode()).hexdigest()[:16]}"'
    assert response["ETag"] == etag
    clock.advance(__import__("datetime").timedelta(seconds=20))
    cached = c.get(url, HTTP_IF_NONE_MATCH=etag)
    assert cached.status_code == 304
    assert cached.content == b""
    assert cached["ETag"] == etag
    assert cached["Cache-Control"] == "private, no-cache"
    send(c, "post", f"/api/trips/{trip.id}/notes", {"body": "Bring gloves", "pinned": True})
    updated = c.get(url, HTTP_IF_NONE_MATCH=etag)
    assert updated.status_code == 200
    assert updated["ETag"] != etag
    assert updated.json()["generated_at"] != generated
    clock.advance(__import__("datetime").timedelta(minutes=1))
    assert c.get(url, HTTP_IF_NONE_MATCH=updated["ETag"]).status_code == 200


def test_today_etag_auth_and_headers(trip, ana, outsider, client_as, monkeypatch):
    c = client_as(ana)
    url = f"/api/trips/{trip.id}/today"
    r = c.get(url)
    assert r.status_code == 200
    assert client_as(outsider).get(url, HTTP_IF_NONE_MATCH=r["ETag"]).status_code == 404
    assert c.get(url, HTTP_IF_NONE_MATCH="*").status_code == 304
    assert c.get(url, HTTP_IF_NONE_MATCH='"other", ' + r["ETag"][2:]).status_code == 304
