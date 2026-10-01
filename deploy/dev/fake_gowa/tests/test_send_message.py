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


def _send(client, phone: str, message: str) -> None:
    assert client.post("/send/message", json={"phone": phone, "message": message}).status_code == 200


def test_latest_matches_with_and_without_suffix_and_plus(client):
    _send(client, "5491155551234@s.whatsapp.net", "code 111111")
    for query in ("5491155551234", "+5491155551234", "5491155551234@s.whatsapp.net"):
        response = client.get("/__sent/latest", params={"phone": query})
        assert response.status_code == 200
        assert response.json()["message"] == "code 111111"


def test_latest_matches_record_without_suffix(client):
    _send(client, "5491155551234", "plain")
    response = client.get("/__sent/latest", params={"phone": "+5491155551234@s.whatsapp.net"})
    assert response.status_code == 200
    assert response.json()["message"] == "plain"


def test_latest_returns_newest(client):
    _send(client, "5491155551234@s.whatsapp.net", "first")
    _send(client, "5491100000000@s.whatsapp.net", "other")
    _send(client, "5491155551234@s.whatsapp.net", "second")
    assert client.get("/__sent/latest", params={"phone": "5491155551234"}).json()["message"] == "second"


def test_latest_404_when_none(client):
    _send(client, "5491100000000@s.whatsapp.net", "other")
    response = client.get("/__sent/latest", params={"phone": "123"})
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert response.json()["message"]


def test_latest_400_without_phone(client):
    response = client.get("/__sent/latest")
    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


GROUP = "120363000000000000@g.us"
ANA = {
    "jid": "5491100000001@s.whatsapp.net",
    "phone_number": "5491100000001@s.whatsapp.net",
    "lid": "251556000000001@lid",
    "display_name": "Ana",
    "is_admin": False,
    "is_super_admin": False,
}
BEN = {**ANA, "jid": "5491100000002@s.whatsapp.net", "phone_number": "5491100000002@s.whatsapp.net", "lid": None, "display_name": "Ben"}


@pytest.fixture
def groups(client):
    client.delete("/__groups")
    return client


def test_group_participants_unknown_group_is_empty_success(groups):
    response = groups.get("/group/participants", params={"group_id": GROUP})
    assert response.status_code == 200
    assert response.json() == {
        "code": "SUCCESS",
        "message": "Success get list participants",
        "results": {"participants": []},
    }


def test_seeded_group_is_returned_in_gowa_shape(groups):
    assert groups.put(f"/__groups/{GROUP}", json=[ANA, BEN]).status_code == 200
    body = groups.get("/group/participants", params={"group_id": GROUP}).json()
    assert body["code"] == "SUCCESS"
    assert body["message"] == "Success get list participants"
    assert body["results"]["participants"] == [ANA, BEN]


def test_seeding_replaces_previous_participants(groups):
    groups.put(f"/__groups/{GROUP}", json=[ANA, BEN])
    groups.put(f"/__groups/{GROUP}", json=[BEN])
    assert groups.get("/group/participants", params={"group_id": GROUP}).json()["results"]["participants"] == [BEN]


def test_list_groups_and_clear(groups):
    groups.put(f"/__groups/{GROUP}", json=[ANA])
    groups.put("/__groups/120363000000000099@g.us", json=[])
    assert groups.get("/__groups").json() == {GROUP: [ANA], "120363000000000099@g.us": []}
    assert groups.delete("/__groups").status_code == 200
    assert groups.get("/__groups").json() == {}


def test_group_participants_requires_group_id(groups):
    response = groups.get("/group/participants")
    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_seed_rejects_non_list_body(groups):
    response = groups.put(f"/__groups/{GROUP}", json={"jid": "x"})
    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_seed_rejects_participant_without_jid(groups):
    assert groups.put(f"/__groups/{GROUP}", json=[{"display_name": "x"}]).status_code == 400
    assert groups.get("/__groups").json() == {}


def test_group_participants_requires_basic_auth_when_configured(groups, monkeypatch):
    groups.put(f"/__groups/{GROUP}", json=[ANA])
    monkeypatch.setenv("APP_BASIC_AUTH", "user:pass")
    assert groups.get("/group/participants", params={"group_id": GROUP}).status_code == 401
    ok = groups.get("/group/participants", params={"group_id": GROUP}, headers=basic("user", "pass"))
    assert ok.status_code == 200
    assert ok.json()["results"]["participants"] == [ANA]
