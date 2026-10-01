"""WAHA payload → ``GroupMessage``. Fixtures follow the WAHA docs (see fixtures/waha/README.md)."""

import pytest

from messaging.tests.waha_fixtures import load
from messaging.waha.parser import normalize_jid, parse_message_event

CHAT = "120363000000000000@g.us"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("5491100000001@c.us", "5491100000001@s.whatsapp.net"),
        ("5491100000001:12@s.whatsapp.net", "5491100000001@s.whatsapp.net"),
        ("5491100000001:12@c.us", "5491100000001@s.whatsapp.net"),
        ("251556000000001@lid", "251556000000001@lid"),
        (CHAT, CHAT),
        (" 5491100000001@c.us ", "5491100000001@s.whatsapp.net"),
        ("", ""),
        (None, ""),
    ],
)
def test_normalize_jid(raw, expected):
    assert normalize_jid(raw) == expected


def test_group_text_with_c_us_sender():
    msg = parse_message_event(load("group_text.json"))
    assert msg is not None
    assert (msg.device_id, msg.chat_id) == ("default", CHAT)
    assert msg.message_id == "false_120363000000000000@g.us_3EB0AAAA0000000001_5491100000001@c.us"
    assert (msg.sender_jid, msg.sender_lid, msg.sender_name) == (
        "5491100000001@s.whatsapp.net",
        "",
        "Fake Friend",
    )
    assert msg.body == "Hola equipo, ¿cuándo viajamos?"
    assert msg.is_from_me is False and msg.is_group is True and msg.replied_to_id == ""
    assert msg.timestamp is not None and msg.timestamp.isoformat() == "2025-10-15T10:30:00+00:00"


def test_lid_sender_keeps_the_lid_and_uses_the_alt_phone_jid():
    msg = parse_message_event(load("group_from_lid.json"))
    assert msg is not None
    assert msg.sender_lid == "251556000000001@lid"
    assert msg.sender_jid == "5491100000001@s.whatsapp.net"
    assert msg.sender_name == "Fake Friend"


def test_lid_sender_without_alt_has_no_jid():
    payload = load("group_from_lid.json")
    del payload["payload"]["_data"]["Info"]["SenderAlt"]
    msg = parse_message_event(payload)
    assert msg is not None
    assert (msg.sender_jid, msg.sender_lid) == ("", "251556000000001@lid")


def test_reply_exposes_the_quoted_message_id():
    msg = parse_message_event(load("group_reply.json"))
    assert msg is not None and msg.replied_to_id == "3EB0BBBB0000000001"
    assert msg.sender_name == "Otra Amiga"


def test_reply_without_quoted_id_is_tolerated():
    payload = load("group_reply.json")
    del payload["payload"]["replyTo"]["id"]
    msg = parse_message_event(payload)
    assert msg is not None and msg.replied_to_id == ""


def test_own_message_and_direct_chat():
    own = parse_message_event(load("group_own_message.json"))
    assert own is not None and own.is_from_me is True
    dm = parse_message_event(load("dm_text.json"))
    assert dm is not None and dm.is_group is False
    assert dm.sender_jid == "5491100000001@s.whatsapp.net"  # direct chats: sender is ``from``


def test_non_message_event_is_none():
    assert parse_message_event(load("session_status.json")) is None


@pytest.mark.parametrize("mutate", ["id", "from", "payload"])
def test_missing_essentials_are_none(mutate):
    payload = load("group_text.json")
    if mutate == "payload":
        payload["payload"] = "x"
    else:
        del payload["payload"][mutate]
    assert parse_message_event(payload) is None


def test_missing_timestamp_and_body_are_tolerated():
    payload = load("group_text.json")
    del payload["payload"]["timestamp"]
    payload["payload"]["body"] = None
    msg = parse_message_event(payload)
    assert msg is not None and msg.timestamp is None and msg.body == ""
