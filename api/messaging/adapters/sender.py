"""Default wiring of the outbound pipeline: Django ledger + Gowa client from settings."""

from django.conf import settings

from messaging.adapters.ledger import DjangoOutboundLedger
from messaging.gowa.client import GowaClient
from messaging.use_cases.send_message import SendResult, send_message


class GowaMessageSender:
    """Writes the ``OutboundMessage`` row and calls Gowa."""

    def send(
        self,
        to_jid: str,
        body: str,
        kind: str,
        *,
        dedupe_key: str | None = None,
        reply_to: str | None = None,
    ) -> SendResult:
        gateway = GowaClient(
            settings.GOWA_BASE_URL,
            settings.GOWA_BASIC_AUTH_USER,
            settings.GOWA_BASIC_AUTH_PASS,
        )
        return send_message(
            ledger=DjangoOutboundLedger(),
            gateway=gateway,
            to_jid=to_jid,
            body=body,
            kind=kind,
            dedupe_key=dedupe_key,
            reply_to=reply_to,
        )
