from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import time_machine

from messaging import reminders
from messaging.domain import InboundRecord
from messaging.handlers import commands
from messaging.handlers.types import HandlerContext
from ski.copy import es_ar
from ski.models import SnowReport
from ski.tests.factories import make_crew, make_person, make_resort, make_trip

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 7, 15, 18, 30, tzinfo=UTC)


@pytest.fixture(autouse=True)
def frozen():
    with time_machine.travel(NOW, tick=False):
        yield


@pytest.fixture
def crew():
    return make_crew()


@pytest.fixture
def ana(crew):
    return make_person("Ana", crew)


@pytest.fixture
def catedral():
    return make_resort("cerro-catedral", name="Cerro Catedral")


@pytest.fixture
def valle():
    return make_resort("valle-nevado", name="Valle Nevado", country="CL")


def set_default(crew, trip):
    crew.default_trip = trip
    crew.save()
    return trip


def report(resort, *, age=timedelta(hours=1), **fields):
    values = dict(
        source="open_meteo",
        base_cm=115,
        new_24h_cm=Decimal("6.2"),
        forecast_72h_cm=Decimal("18.7"),
        temp_c=Decimal("-2.4"),
    )
    values.update(fields)
    return SnowReport.objects.create(
        resort=resort, observed_at=NOW - age, fetched_at=NOW - age, **values
    )


def say(crew, person, body):
    replies: list[str] = []
    ctx = HandlerContext(
        message=InboundRecord(
            id=1,
            chat_id="120363000000000000@g.us",
            gowa_message_id="M1",
            body=body,
            sender_jid="",
            sender_lid="",
            sender_name="Ana",
            replied_to_id="",
            attempts=1,
        ),
        person_id=str(person.pk),
        crew_id=str(crew.pk),
        reply=lambda text: replies.append(text) or "sent",
    )
    handled = commands.handle(ctx)
    assert handled is not None
    return replies, handled


def test_nieve_is_registered_as_a_subcommand_with_help():
    assert "/viaje nieve" in commands.help_text()
    assert es_ar.HELP_NIEVE in commands.help_text()


def test_reports_the_conditions_of_each_trip_resort(crew, ana, catedral, valle):
    set_default(crew, make_trip(crew, resorts=[catedral, valle]))
    report(catedral)
    report(
        valle, base_cm=210, new_24h_cm=Decimal("0.0"), forecast_72h_cm=None, temp_c=Decimal("-6")
    )
    replies, handled = say(crew, ana, "/viaje nieve")
    assert replies == [
        "❄️ Nieve:\n"
        "Cerro Catedral: 115 cm de base · 6,2 cm nuevos en 24 h · -2,4 °C (hace 1 h)"
        " · pronóstico 18,7 cm en 3 días\n"
        "Valle Nevado: 210 cm de base · 0 cm nuevos en 24 h · -6 °C (hace 1 h)"
    ]
    assert handled.handler == "ski" and handled.detail["command"] == "nieve"


def test_accent_and_case_insensitive_command(crew, ana, catedral):
    set_default(crew, make_trip(crew, resorts=[catedral]))
    report(catedral)
    replies, _ = say(crew, ana, "/V  NIÉVE")
    assert replies[0].startswith(es_ar.SNOW_HEADER)


def test_a_fresh_reading_under_an_hour_says_recien(crew, ana, catedral):
    set_default(crew, make_trip(crew, resorts=[catedral]))
    report(catedral, age=timedelta(minutes=10), forecast_72h_cm=None)
    replies, _ = say(crew, ana, "/viaje nieve")
    assert replies[0].endswith("-2,4 °C (recién)")


def test_old_data_gets_the_stale_suffix(crew, ana, catedral):
    set_default(crew, make_trip(crew, resorts=[catedral]))
    report(catedral, age=timedelta(hours=13), forecast_72h_cm=None)
    replies, _ = say(crew, ana, "/viaje nieve")
    assert replies[0].endswith("(hace 13 h)" + es_ar.SNOW_STALE)
    fresh_edge = report(catedral, age=timedelta(hours=11, minutes=59), forecast_72h_cm=None)
    replies, _ = say(crew, ana, "/viaje nieve")
    assert fresh_edge.pk and es_ar.SNOW_STALE not in replies[0]


def test_manual_reports_show_lifts_and_have_no_provider_forecast(crew, ana, catedral):
    set_default(crew, make_trip(crew, resorts=[catedral]))
    report(
        catedral,
        source="manual",
        new_24h_cm=None,
        forecast_72h_cm=None,
        temp_c=None,
        lifts_open=7,
        lifts_total=12,
    )
    replies, _ = say(crew, ana, "/viaje nieve")
    assert replies[0] == (
        "❄️ Nieve:\nCerro Catedral: 115 cm de base · 7/12 medios abiertos (hace 1 h)"
    )


def test_resort_without_reports_says_so(crew, ana, catedral):
    set_default(crew, make_trip(crew, resorts=[catedral]))
    replies, _ = say(crew, ana, "/viaje nieve")
    assert replies == ["❄️ Nieve:\nCerro Catedral: sin datos todavía"]


def test_trip_without_resorts_points_to_the_web(crew, ana, settings):
    settings.PUBLIC_ORIGIN = "https://viajecito.example.com"
    trip = set_default(crew, make_trip(crew))
    replies, _ = say(crew, ana, "/viaje nieve")
    assert replies == [
        "Este viaje todavía no tiene centros de ski. "
        f"Sumalos en https://viajecito.example.com/crews/{crew.pk}/trips/{trip.pk}/ski"
    ]


def test_non_ski_trip(crew, ana):
    set_default(crew, make_trip(crew, type="generic"))
    replies, _ = say(crew, ana, "/viaje nieve")
    assert replies == [es_ar.NOT_SKI_TRIP]


def test_crew_without_default_trip(crew, ana):
    replies, _ = say(crew, ana, "/viaje nieve")
    assert replies == [es_ar.NO_TRIP]


def test_manual_report_by_resort_prefix(crew, ana, catedral, valle):
    set_default(crew, make_trip(crew, resorts=[catedral, valle]))
    replies, handled = say(crew, ana, "/viaje nieve catedral 120 15")
    assert replies == ["Gracias Ana, anoté 120 cm en Cerro Catedral 🙌"]
    saved = SnowReport.objects.get()
    assert (saved.resort, saved.source, saved.base_cm) == (catedral, "manual", 120)
    assert saved.new_24h_cm == Decimal("15") and saved.reporter_id == ana.pk
    assert saved.observed_at == NOW
    assert handled.detail["command"] == "nieve"


def test_manual_report_without_new_snow_and_multi_word_prefix(crew, ana, valle):
    set_default(crew, make_trip(crew, resorts=[valle]))
    say(crew, ana, "/viaje nieve valle nevado 80")
    saved = SnowReport.objects.get()
    assert saved.base_cm == 80 and saved.new_24h_cm is None


def test_ambiguous_or_unknown_resort_lists_the_trip_resorts(crew, ana, catedral):
    bayo = make_resort("cerro-bayo", name="Cerro Bayo")
    set_default(crew, make_trip(crew, resorts=[catedral, bayo]))
    for body in ("/viaje nieve cerro 100", "/viaje nieve chapelco 100"):
        replies, _ = say(crew, ana, body)
        assert replies == ["No encontré ese centro. Los del viaje: Cerro Catedral, Cerro Bayo"]
    assert not SnowReport.objects.exists()


@pytest.mark.parametrize(
    "args",
    [
        "catedral",
        "catedral abc",
        "catedral 5000",
        "catedral 100 400",
        "catedral -5",
        "120",
        "catedral 1.5",
    ],
)
def test_bad_numbers_show_usage(crew, ana, catedral, args):
    set_default(crew, make_trip(crew, resorts=[catedral]))
    replies, _ = say(crew, ana, f"/viaje nieve {args}")
    assert replies == [es_ar.NIEVE_USAGE]
    assert not SnowReport.objects.exists()


def test_manual_reports_are_rate_limited_per_resort(crew, ana, catedral):
    set_default(crew, make_trip(crew, resorts=[catedral]))
    for _ in range(6):
        replies, _ = say(crew, ana, "/viaje nieve catedral 100")
        assert replies[0].startswith("Gracias")
    replies, _ = say(crew, ana, "/viaje nieve catedral 100")
    assert replies == [es_ar.RATE_LIMITED]
    assert SnowReport.objects.count() == 6


def test_manual_report_on_a_non_ski_trip_is_refused(crew, ana, catedral):
    set_default(crew, make_trip(crew, type="generic", resorts=[catedral]))
    replies, _ = say(crew, ana, "/viaje nieve catedral 100")
    assert replies == [es_ar.NOT_SKI_TRIP]


def test_digest_section_lists_the_conditions(crew, catedral):
    trip = make_trip(crew, resorts=[catedral])
    report(catedral, forecast_72h_cm=None)
    section = dict(reminders._SECTIONS)["ski.snow"]
    assert section[0] == 20
    text = section[1](str(trip.pk), NOW.date())
    assert (
        text
        == "❄️ Nieve:\nCerro Catedral: 115 cm de base · 6,2 cm nuevos en 24 h · -2,4 °C (hace 1 h)"
    )


def test_digest_section_is_none_for_non_ski_trips_or_without_reports(crew, catedral):
    section = dict(reminders._SECTIONS)["ski.snow"][1]
    generic = make_trip(crew, type="generic")
    ski = make_trip(crew, resorts=[catedral])
    assert section(str(generic.pk), NOW.date()) is None
    assert section(str(ski.pk), NOW.date()) is None
    assert section("00000000-0000-0000-0000-000000000000", NOW.date()) is None
