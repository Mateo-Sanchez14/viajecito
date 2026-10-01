import pytest

from identity.domain import InvalidPhoneError, normalize_phone


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("+54 9 11 5555-1234", "+5491155551234"),
        ("011 15 5555 1234", "+5491155551234"),
        ("+56 9 8765 4321", "+56987654321"),
        ("+5491155551234", "+5491155551234"),
        ("  (011) 15-5555-1234 ", "+5491155551234"),
    ],
)
def test_normalizes_free_form_input_to_e164(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "abc", "123", "+54 11", "0000000000000000000", "   "])
def test_rejects_invalid_numbers(raw):
    with pytest.raises(InvalidPhoneError):
        normalize_phone(raw)


def test_ar_mobile_without_nine_is_normalized_with_nine():
    assert normalize_phone("+54 11 15 5555 1234") == "+5491155551234"
