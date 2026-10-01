"""Default wiring of the outbound pipeline: Django ledger + Gowa client from settings."""

from messaging.adapters.ledger import DjangoOutboundLedger
from messaging.adapters.provider import build_gateway
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
        subject_type: str = "",
        subject_id: str = "",
    ) -> SendResult:
        gateway = build_gateway()
        return send_message(
            ledger=DjangoOutboundLedger(),
            gateway=gateway,
            to_jid=to_jid,
            body=body,
            kind=kind,
            dedupe_key=dedupe_key,
            reply_to=reply_to,
            subject_type=subject_type,
            subject_id=subject_id,
        )
