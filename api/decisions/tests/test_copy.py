from datetime import date

import pytest

from decisions.copy import es_ar


@pytest.mark.parametrize(
    ("day", "text"),
    [
        (date(2026, 7, 12), "dom 12/7"),
        (date(2026, 7, 11), "sáb 11/7"),
        (date(2026, 7, 6), "lun 6/7"),
        (date(2026, 7, 7), "mar 7/7"),
        (date(2026, 7, 8), "mié 8/7"),
        (date(2026, 7, 9), "jue 9/7"),
        (date(2026, 7, 10), "vie 10/7"),
        (date(2027, 12, 31), "vie 31/12"),
    ],
)
def test_format_day(day, text):
    assert es_ar.format_day(day) == text


def test_the_copy_uses_voseo():
    assert "Marcá" in es_ar.LINK_LINE and "Arrancala" in es_ar.NO_DECISION
