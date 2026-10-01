"""Bot copy of the decisions app (Rioplatense Spanish, voseo); the only Spanish in this app."""

from datetime import date, datetime

HELP_FECHAS = "/viaje fechas — cómo vamos con las fechas"

SUMMARY_HEADER = "📅 Fechas para {trip}:"
WINDOW_LINE = "{rank}) {start} al {end} · {full} pueden, {blocked} no"
NO_VOTES_YET = "Todavía no votó nadie."
SOMEONE = "alguien"  # stands in for a member without a display name
MISSING_LINE = "Falta que marquen: {names}"
DEADLINE_LINE = "Cerramos el {deadline}."
LINK_LINE = "Marcá tus días acá 👉 {url}"

NO_DECISION = "Todavía no abrimos la votación de fechas. Arrancala en {url}."
DATES_FIXED = "Ya tenemos fechas: {start} al {end} 🙌"
NO_TRIP = "Todavía no hay un viaje armado. Creá uno en {url}."

MISSING_VOTES = "⏰ Falta votar fechas: {mentions}. Cerramos {when}. 👉 {url}"
MISSING_VOTES_NO_DEADLINE = "⏰ Falta votar fechas: {mentions}. 👉 {url}"
MISSING_VOTES_TITLE = "Falta votar fechas"

_WEEKDAYS = ("lun", "mar", "mié", "jue", "vie", "sáb", "dom")


def format_day(day: date) -> str:
    """``sáb 12/7``."""
    return f"{_WEEKDAYS[day.weekday()]} {day.day}/{day.month}"


def format_moment(moment: datetime) -> str:
    """``sáb 12/7 a las 18:00`` (the caller converts to the trip's timezone first)."""
    return f"{format_day(moment.date())} a las {moment:%H:%M}"
