"""Delivers OTP codes over WhatsApp, off the request path.

``DeferredOtpSender`` submits the Gowa call to a small module-level thread pool from
``transaction.on_commit`` so the response time of ``POST /api/auth/otp/request`` does not depend
on whether a message is sent (and therefore does not leak eligibility).
"""

import logging
from concurrent.futures import ThreadPoolExecutor

from django.db import close_old_connections, transaction

from identity.domain import phone_to_jid
from identity.ports import MessageSender
from messaging.adapters.sender import GowaMessageSender
from messaging.copy import es_ar

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="otp-send")


class WhatsAppOtpSender:
    """Synchronous delivery through the messaging app (writes the redacted ledger row)."""

    def __init__(self, sender: GowaMessageSender | None = None) -> None:
        self._sender = sender or GowaMessageSender()

    def send_otp(self, phone: str, code: str, expires_in_seconds: int) -> None:
        body = es_ar.OTP_CODE.format(code=code, minutes=expires_in_seconds // 60)
        self._sender.send(phone_to_jid(phone), body, "otp")


class DeferredOtpSender:
    def __init__(self, inner: MessageSender, *, synchronous: bool) -> None:
        self._inner = inner
        self._synchronous = synchronous

    def send_otp(self, phone: str, code: str, expires_in_seconds: int) -> None:
        if self._synchronous:
            self._deliver(phone, code, expires_in_seconds)
            return
        transaction.on_commit(
            lambda: _executor.submit(self._deliver_in_thread, phone, code, expires_in_seconds)
        )

    def _deliver(self, phone: str, code: str, expires_in_seconds: int) -> None:
        try:
            self._inner.send_otp(phone, code, expires_in_seconds)
        except Exception:  # delivery problems are logged, never surfaced to the caller
            logger.exception("otp delivery failed")

    def _deliver_in_thread(self, phone: str, code: str, expires_in_seconds: int) -> None:
        try:
            self._deliver(phone, code, expires_in_seconds)
        finally:
            close_old_connections()
