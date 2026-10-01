"""Renders snow conditions as WhatsApp copy."""

from decimal import Decimal

from ski.copy import es_ar
from ski.domain import Conditions, ReportView


def number(value: Decimal | int) -> str:
    """``6.2`` -> ``6,2``; ``0.0`` -> ``0``; ``-6`` -> ``-6`` (Argentine decimal comma)."""
    text = f"{Decimal(value).normalize():f}"
    return text.replace(".", ",")


def _age(view: ReportView) -> str:
    if view.age_hours < 1:
        return es_ar.AGE_MINUTES
    return es_ar.AGE_HOURS.format(hours=view.age_hours)


def snow_line(resort_name: str, view: ReportView) -> str:
    report = view.report
    parts = []
    if report.base_cm is not None:
        parts.append(es_ar.SNOW_BASE.format(base=number(report.base_cm)))
    if report.new_24h_cm is not None:
        parts.append(es_ar.SNOW_NEW.format(new=number(report.new_24h_cm)))
    if report.temp_c is not None:
        parts.append(es_ar.SNOW_TEMP.format(temp=number(report.temp_c)))
    if report.lifts_open is not None and report.lifts_total is not None:
        parts.append(es_ar.SNOW_LIFTS.format(open=report.lifts_open, total=report.lifts_total))
    line = es_ar.SNOW_LINE.format(
        resort=resort_name, parts=" · ".join(parts) or es_ar.SNOW_NO_DETAIL, age=_age(view)
    )
    if report.forecast_72h_cm is not None:
        line += es_ar.SNOW_FORECAST.format(forecast=number(report.forecast_72h_cm))
    return line + (es_ar.SNOW_STALE if view.stale else "")


def conditions_block(conditions: list[Conditions]) -> str:
    lines = [es_ar.SNOW_HEADER]
    for item in conditions:
        name = item.trip_resort.resort.name
        lines.append(
            snow_line(name, item.latest) if item.latest else es_ar.NO_REPORT.format(resort=name)
        )
    return "\n".join(lines)
