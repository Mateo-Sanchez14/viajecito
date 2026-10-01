import pytest

from messaging.copy import es_ar
from messaging.domain import InboundRecord
from messaging.handlers.commands import handle, parse_command
from messaging.handlers.types import HandlerContext


def ctx(body: str, replies: list[str]) -> HandlerContext:
    record = InboundRecord(
        id=7,
        chat_id="120363000000000000@g.us",
        gowa_message_id="MSG7",
        body=body,
        sender_jid="5491100000001@s.whatsapp.net",
        sender_lid="",
        sender_name="Ana",
        replied_to_id="",
        attempts=1,
    )
    return HandlerContext(
        message=record,
        person_id="p1",
        crew_id="c1",
        reply=lambda text: replies.append(text) or "sent",
    )


@pytest.mark.parametrize(
    ("text", "sub"),
    [
        ("/viaje ping", "ping"),
        ("/v ping", "ping"),
        ("/V  PÍNG", "ping"),
        ("  /VIAJE\tayuda  ", "ayuda"),
        ("/viaje ping extra words", "ping"),
        ("/viaje", ""),
        ("/v", ""),
        ("/viaje Ayúda", "ayuda"),
    ],
)
def test_parse_command(text, sub):
    assert parse_command(text) == sub


@pytest.mark.parametrize(
    "text",
    ["hola", "viaje ping", "/viajecito ping", "/vamos", "/ping", "", "   ", "hola /viaje ping"],
)
def test_non_commands_are_none(text):
    assert parse_command(text) is None


def test_ping_replies_pong():
    replies: list[str] = []
    handled = handle(ctx("/viaje ping", replies))
    assert replies == [es_ar.PONG] and es_ar.PONG == "pong"
    assert handled.handler == "commands" and handled.detail["command"] == "ping"


def test_accent_and_case_insensitive_ping():
    replies: list[str] = []
    assert handle(ctx("/V  PÍNG", replies)) is not None
    assert replies == [es_ar.PONG]


def test_ayuda_and_bare_command_reply_help():
    replies: list[str] = []
    handle(ctx("/viaje ayuda", replies))
    handle(ctx("/viaje", replies))
    assert replies == [es_ar.HELP, es_ar.HELP]


def test_unknown_subcommand_replies_with_the_hint():
    replies: list[str] = []
    handled = handle(ctx("/viaje bailar", replies))
    assert replies == [es_ar.UNKNOWN_COMMAND]
    assert handled.detail["command"] == "unknown"


def test_plain_text_is_not_handled_and_stays_silent():
    replies: list[str] = []
    assert handle(ctx("hola equipo", replies)) is None
    assert replies == []
