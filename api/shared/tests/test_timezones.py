import pytest

from shared.timezones import InvalidTimezoneError, validate_timezone


def test_known_iana_names_are_returned_unchanged():
    assert validate_timezone("America/Argentina/Buenos_Aires") == "America/Argentina/Buenos_Aires"
    assert validate_timezone("UTC") == "UTC"


@pytest.mark.parametrize("raw", ["", "Mars/Olympus", "../etc/passwd", "buenos aires", "America/"])
def test_anything_else_is_rejected(raw):
    with pytest.raises(InvalidTimezoneError):
        validate_timezone(raw)
