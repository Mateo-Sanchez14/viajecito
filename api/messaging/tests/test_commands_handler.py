import pytest

from messaging.copy import es_ar
from messaging.domain import InboundRecord
from messaging.handlers import commands
from messaging.handlers.commands import handle, help_text, parse_command, register_subcommand
from messaging.handlers.types import Handled, HandlerContext


def ctx(body: str, replies: list[str], **extra) -> HandlerContext:
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
        **extra,
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
    assert replies == [help_text(), help_text()]


def test_unknown_subcommand_replies_with_the_hint():
    replies: list[str] = []
    handled = handle(ctx("/viaje bailar", replies))
    assert replies == [f"{es_ar.UNKNOWN_COMMAND}\n{help_text()}"]
    assert replies[0].splitlines()[0] == es_ar.UNKNOWN_COMMAND  # the hint leads the help
    assert handled.detail["command"] == "unknown"


def test_plain_text_is_not_handled_and_stays_silent():
    replies: list[str] = []
    assert handle(ctx("hola equipo", replies)) is None
    assert replies == []


# --- subcommand registry (R-3) ---------------------------------------------------------------


@pytest.fixture
def registry():
    """An isolated registry holding only the core subcommands."""
    with commands.isolated():
        yield


def tareas(context, args):
    context.reply(f"tareas:{args}")
    return Handled("logistics.tareas", {"args": args})


def test_a_registered_subcommand_receives_ctx_and_the_original_args(registry):
    replies: list[str] = []
    register_subcommand("tareas", tareas, help_line="/viaje tareas — pendientes")
    handled = handle(ctx("/viaje  TAREAS  Pedir Hotel  X ", replies))
    assert replies == ["tareas:Pedir Hotel  X"]  # args: original casing, stripped
    assert handled == Handled("logistics.tareas", {"args": "Pedir Hotel  X"})


def test_names_and_aliases_match_accent_and_case_insensitively(registry):
    replies: list[str] = []
    register_subcommand("listo", tareas, aliases=("hecho", "Terminádo"))
    for text in ("/v LISTO 1", "/viaje hecho 1", "/v TERMINADO 1"):
        handle(ctx(text, replies))
    assert replies == ["tareas:1"] * 3


def test_an_unclaimed_subcommand_returns_none(registry):
    register_subcommand("hoy", lambda context, args: None)
    assert handle(ctx("/viaje hoy", [])) is None


def test_throttled_chats_never_reach_the_subcommand(registry):
    called: list[str] = []
    register_subcommand("hoy", lambda context, args: called.append(args))
    handled = handle(ctx("/viaje hoy", [], reply_allowed=lambda: False))
    assert called == [] and handled.detail == {
        "command": "hoy",
        "reply": "throttled",
        "throttled": True,
    }


def test_ping_and_ayuda_are_registered_subcommands(registry):
    assert {"ping", "ayuda"} <= set(commands._SUBCOMMANDS)


def test_help_composes_the_intro_and_every_help_line_sorted_by_name(registry):
    register_subcommand("tareas", tareas, help_line="/viaje tareas — pendientes")
    register_subcommand("fechas", tareas, aliases=("fecha",), help_line="/viaje fechas — votar")
    register_subcommand("quiet", tareas)  # no help line: not listed
    lines = help_text().splitlines()
    assert lines[0] == es_ar.HELP_INTRO
    assert lines[1:] == [
        es_ar.AYUDA_HELP,
        "/viaje fechas — votar",
        es_ar.PING_HELP,
        "/viaje tareas — pendientes",
    ]


def test_registering_twice_is_idempotent_and_a_clash_is_rejected(registry):
    register_subcommand("hoy", tareas)
    register_subcommand("hoy", tareas)
    with pytest.raises(ValueError):
        register_subcommand("hoy", lambda context, args: None)
    with pytest.raises(ValueError):
        register_subcommand("otra", tareas, aliases=("hoy",))
    with pytest.raises(ValueError):
        register_subcommand("PING", tareas)


def test_isolated_starts_with_the_core_subcommands_and_restores_the_registry(registry):
    register_subcommand("outer", tareas)
    with commands.isolated():
        assert set(commands._SUBCOMMANDS) == {"ping", "ayuda"}
        register_subcommand("inner", tareas)
    assert set(commands._SUBCOMMANDS) == {"ping", "ayuda", "outer"}
    assert "inner" not in commands._ALIASES.values()
