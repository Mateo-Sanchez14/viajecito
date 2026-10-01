"""Phone number normalization shared by every app (pure; no Django)."""

import phonenumbers

DEFAULT_REGION = "AR"


class InvalidPhoneError(ValueError):
    """The input is not a valid phone number."""


def normalize_phone(raw: str, region: str = DEFAULT_REGION) -> str:
    """Return the E.164 form of a free-form phone number or raise ``InvalidPhoneError``."""
    try:
        number = phonenumbers.parse(raw.strip(), region)
    except phonenumbers.NumberParseException as exc:
        raise InvalidPhoneError(str(exc)) from exc
    if not phonenumbers.is_valid_number(number):
        raise InvalidPhoneError(f"not a valid phone number: {raw!r}")
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)


def phone_to_jid(phone: str) -> str:
    """WhatsApp JID of an E.164 phone: digits only plus the user server."""
    return f"{phone.lstrip('+')}@s.whatsapp.net"
