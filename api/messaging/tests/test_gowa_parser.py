import pytest

from messaging.gowa.parser import normalize_jid, parse_message_event
from messaging.tests.gowa_fixtures import load

CHAT = "120363000000000000@g.us"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("5491100000001@s.whatsapp.net", "5491100000001@s.whatsapp.net"),
        ("5491100000001:12@s.whatsapp.net", "5491100000001@s.whatsapp.net"),
        ("251556000000001:3@lid", "251556000000001@lid"),
        ("120363000000000000@g.us", "120363000000000000@g.us"),
        ("  5491100000001@s.whatsapp.net ", "5491100000001@s.whatsapp.net"),
        ("", ""),
        (None, ""),
    ],
)
def test_normalize_jid(raw, expected):
    assert normalize_jid(raw) == expected


def test_group_text():
    msg = parse_message_event(load("group_text.json"))
    assert msg is not None
    assert (msg.device_id, msg.message_id, msg.chat_id) == (
        "5491100000009@s.whatsapp.net",
        "3EB0AAAA0000000001",
        CHAT,
    )
    assert (msg.sender_jid, msg.sender_lid, msg.sender_name) == (
        "5491100000001@s.whatsapp.net",
        "251556000000001@lid",
        "Fake Friend",
    )
    assert msg.body == "Hola equipo, ¿cuándo viajamos?"
    assert msg.is_from_me is False and msg.is_group is True
    assert msg.timestamp is not None and msg.timestamp.year == 2025


def test_sender_known_only_by_lid():
    msg = parse_message_event(load("group_from_lid.json"))
    assert (msg.sender_jid, msg.sender_lid) == ("", "251556000000002@lid")


def test_device_suffix_is_stripped():
    msg = parse_message_event(load("group_text_with_device_suffix.json"))
    assert msg.sender_jid == "5491100000001@s.whatsapp.net"


def test_own_message_and_dm_are_parsed_with_their_flags():
    assert parse_message_event(load("group_own_message.json")).is_from_me is True
    assert parse_message_event(load("dm_text.json")).is_group is False


def test_non_message_event_is_not_a_message():
    assert parse_message_event(load("message_ack.json")) is None


def test_missing_optional_fields_are_tolerated():
    msg = parse_message_event(
        {"event": "message", "payload": {"id": "X1", "chat_id": CHAT, "from": "1@s.whatsapp.net"}}
    )
    assert msg is not None
    assert (msg.device_id, msg.body, msg.replied_to_id, msg.sender_name) == ("", "", "", "")
    assert msg.timestamp is None and msg.is_from_me is False


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"event": "message"},
        {"event": "message", "payload": "nope"},
        {"event": "message", "payload": {"chat_id": CHAT}},
        {"event": "message", "payload": {"id": "X"}},
    ],
)
def test_malformed_message_is_none(payload):
    assert parse_message_event(payload) is None


def test_reply_carries_the_quoted_message_id():
    payload = load("group_text.json")
    payload["payload"]["replied_to_id"] = "ORIG1"
    assert parse_message_event(payload).replied_to_id == "ORIG1"
