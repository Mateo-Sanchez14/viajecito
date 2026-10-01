from datetime import date

import pytest

from decisions.copy import es_ar
from decisions.models import AvailabilityResponse, Decision
from decisions.tests.conftest import rsvp
from messaging.domain import InboundRecord
from messaging.handlers import commands
from messaging.handlers.types import HandlerContext

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def registered():
    from decisions.bot import register

    register()


@pytest.fixture
def default_trip(crew, trip):
    crew.default_trip = trip
    crew.save()
    return trip


def say(crew, person, body="/viaje fechas", allowed=True):
    replies: list[str] = []
    record = InboundRecord(
        id=1,
        chat_id="120363000000000000@g.us",
        gowa_message_id="M1",
        body=body,
        sender_jid="",
        sender_lid="",
        sender_name="",
        replied_to_id="",
        attempts=1,
    )
    ctx = HandlerContext(
        message=record,
        person_id=str(person.pk),
        crew_id=str(crew.pk),
        reply=lambda text: replies.append(text) or "sent",
        reply_allowed=lambda: allowed,
    )
    return commands.handle(ctx), replies


def open_decision(trip, person, **overrides):
    fields = {
        "window_start": date(2026, 7, 1),
        "window_end": date(2026, 7, 31),
        "min_days": 3,
        "max_days": 3,
        "opened_by": person,
    }
    return Decision.objects.create(trip=trip, **{**fields, **overrides})


def answer(trip, person, days, value="yes"):
    for day in days:
        AvailabilityResponse.objects.create(
            trip=trip, person=person, date=date(2026, 7, day), answer=value
        )


def test_registered_with_the_fecha_alias_and_a_help_line(crew, ana, default_trip):
    assert es_ar.HELP_FECHAS in commands.help_text()
    for text in ("/viaje fechas", "/V  FECHA", "/v fechas"):
        handled, replies = say(crew, ana, text)
        assert handled.detail["command"] == "fechas" and len(replies) == 1


def test_no_open_decision_and_no_dates_points_to_the_dates_page(crew, ana, default_trip, settings):
    settings.PUBLIC_ORIGIN = "https://viajecito.example.com"
    handled, replies = say(crew, ana)
    url = f"https://viajecito.example.com/crews/{crew.pk}/trips/{default_trip.pk}/dates"
    assert replies == [es_ar.NO_DECISION.format(url=url)]
    assert handled.detail["command"] == "fechas"


def test_no_open_decision_but_dates_set_replies_with_the_fixed_dates(crew, ana, default_trip):
    default_trip.start_on, default_trip.end_on = date(2026, 7, 11), date(2026, 7, 18)
    default_trip.save()
    _, replies = say(crew, ana, "/viaje fecha")
    assert replies == [es_ar.DATES_FIXED.format(start="sáb 11/7", end="sáb 18/7")]


def test_an_open_decision_summarizes_windows_missing_people_deadline_and_link(
    crew, ana, beto, cleo, default_trip, settings
):
    settings.PUBLIC_ORIGIN = "https://viajecito.example.com"
    open_decision(default_trip, ana, deadline="2026-07-05T21:00:00Z")
    answer(default_trip, ana, [14, 15, 16])
    answer(default_trip, beto, [14, 15, 16])
    answer(default_trip, beto, [20], "no")
    _, replies = say(crew, ana)
    text = replies[0]
    lines = text.splitlines()
    assert lines[0] == es_ar.SUMMARY_HEADER.format(trip="Verano 2027")
    assert lines[1] == es_ar.WINDOW_LINE.format(
        rank=1, start="mar 14/7", end="jue 16/7", full=2, blocked=0
    )
    assert len([line for line in lines if line[:2] in {"1)", "2)", "3)"}]) == 3
    assert es_ar.MISSING_LINE.format(names="Cleo") in text
    assert es_ar.DEADLINE_LINE.format(deadline="dom 5/7 a las 18:00") in text  # Buenos Aires
    assert lines[-1] == es_ar.LINK_LINE.format(
        url=f"https://viajecito.example.com/crews/{crew.pk}/trips/{default_trip.pk}/dates"
    )
    assert "@" not in text  # replies never mention people


def test_without_votes_the_summary_says_so_instead_of_ranking_noise(crew, ana, default_trip):
    open_decision(default_trip, ana)
    _, replies = say(crew, ana)
    assert es_ar.NO_VOTES_YET in replies[0]
    assert "1)" not in replies[0]
    assert es_ar.MISSING_LINE.format(names="Ana") in replies[0]
    assert "Cerramos" not in replies[0]  # no deadline, no deadline line


def test_everyone_answered_omits_the_missing_line(crew, ana, default_trip):
    open_decision(default_trip, ana)
    answer(default_trip, ana, [10, 11, 12])
    _, replies = say(crew, ana)
    assert "Falta que marquen" not in replies[0]


def test_out_participants_are_not_listed_as_missing(crew, ana, beto, default_trip):
    rsvp(default_trip, beto, "out")
    open_decision(default_trip, ana)
    answer(default_trip, ana, [10, 11, 12])
    _, replies = say(crew, ana)
    assert "Beto" not in replies[0]


def test_the_crew_without_a_default_trip_gets_a_hint(crew, ana, trip, settings):
    settings.PUBLIC_ORIGIN = "https://viajecito.example.com"
    _, replies = say(crew, ana)
    assert replies == [es_ar.NO_TRIP.format(url="https://viajecito.example.com")]


def test_a_throttled_chat_is_not_answered(crew, ana, default_trip):
    handled, replies = say(crew, ana, allowed=False)
    assert replies == [] and handled.detail["throttled"] is True


def test_nameless_members_are_never_listed_by_phone(crew, ana, default_trip):
    from decisions.tests.conftest import join
    from identity.models import Person

    ghost = Person.objects.create_user("+5491155554444")  # no display name
    join(crew, ghost)
    open_decision(default_trip, ana)
    answer(default_trip, ana, [10, 11, 12])
    _, replies = say(crew, ana)
    assert es_ar.MISSING_LINE.format(names=es_ar.SOMEONE) in replies[0]
    assert "+549" not in replies[0] and "5491155554444" not in replies[0]
