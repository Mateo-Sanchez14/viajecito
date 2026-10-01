"""Pure identity rules (no Django, no HTTP)."""

from shared.phone import InvalidPhoneError, normalize_phone, phone_to_jid

__all__ = ["InvalidPhoneError", "normalize_phone", "phone_to_jid"]
