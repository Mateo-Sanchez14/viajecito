import base64

import pytest
from fastapi.testclient import TestClient

import app as fake_app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("APP_BASIC_AUTH", raising=False)
    fake_app.SENT.clear()
    return TestClient(fake_app.app)


def basic(user: str, password: str) -> dict[str, str]:
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_send_message_returns_gowa_shaped_success(client):
    response = client.post("/send/message", json={"phone": "5491100000000", "message": "hola"})
    assert response.status_code == 200
    body = response.json()
    assert body["code"] == "SUCCESS"
    assert body["message"] == "Message sent"
    assert body["results"]["message_id"]
    assert body["results"]["status"] == "Message sent to 5491100000000"


def test_send_message_is_recorded(client):
    sent = client.post(
        "/send/message",
        json={"phone": "5491100000000", "message": "hola", "reply_message_id": "abc"},
    ).json()
    records = client.get("/__sent").json()
    assert len(records) == 1
    record = records[0]
    assert record["id"] == sent["results"]["message_id"]
    assert record["phone"] == "5491100000000"
    assert record["message"] == "hola"
    assert record["reply_message_id"] == "abc"
    assert record["received_at"]


def test_reply_message_id_is_optional(client):
    client.post("/send/message", json={"phone": "1", "message": "m"})
    assert client.get("/__sent").json()[0]["reply_message_id"] is None


@pytest.mark.parametrize(
    "payload",
    [{}, {"phone": "1"}, {"message": "m"}, {"phone": "", "message": "m"}, {"phone": "1", "message": ""}],
)
def test_missing_fields_are_rejected(client, payload):
    response = client.post("/send/message", json=payload)
    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert body["message"]
    assert client.get("/__sent").json() == []


def test_sent_filter_by_phone_newest_last(client):
    for phone, message in [("1", "a"), ("2", "b"), ("1", "c")]:
        client.post("/send/message", json={"phone": phone, "message": message})
    assert [r["message"] for r in client.get("/__sent").json()] == ["a", "b", "c"]
    assert [r["message"] for r in client.get("/__sent", params={"phone": "1"}).json()] == ["a", "c"]


def test_delete_sent_clears_records(client):
    client.post("/send/message", json={"phone": "1", "message": "a"})
    assert client.delete("/__sent").status_code == 200
    assert client.get("/__sent").json() == []


def test_basic_auth_required_when_configured(client, monkeypatch):
    monkeypatch.setenv("APP_BASIC_AUTH", "user:pass")
    payload = {"phone": "1", "message": "a"}
    assert client.post("/send/message", json=payload).status_code == 401
    assert client.post("/send/message", json=payload, headers=basic("user", "nope")).status_code == 401
    assert client.post("/send/message", json=payload, headers=basic("user", "pass")).status_code == 200


def test_auth_failure_records_nothing(client, monkeypatch):
    monkeypatch.setenv("APP_BASIC_AUTH", "user:pass")
    client.post("/send/message", json={"phone": "1", "message": "a"})
    assert client.get("/__sent").json() == []
