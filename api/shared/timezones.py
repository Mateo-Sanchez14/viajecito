"""IANA timezone validation shared by every app (pure; no Django)."""

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class InvalidTimezoneError(ValueError):
    """The input is not a known IANA timezone name."""


def validate_timezone(name: str) -> str:
    """Return ``name`` when ``zoneinfo`` knows it, else raise ``InvalidTimezoneError``."""
    try:
        ZoneInfo(name)
    except (ValueError, OSError, ZoneInfoNotFoundError) as exc:
        raise InvalidTimezoneError(f"unknown timezone: {name!r}") from exc
    return name
