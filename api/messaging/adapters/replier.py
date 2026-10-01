from messaging.adapters.sender import GowaMessageSender


class GroupReplier:
    """Replies in the group through the outbound ledger (one reply per inbound message)."""

    def __init__(self, sender: GowaMessageSender | None = None) -> None:
        self._sender = sender or GowaMessageSender()

    def reply(self, *, chat_id: str, body: str, reply_to: str, inbound_id: int) -> str:
        result = self._sender.send(
            chat_id,
            body,
            "reply",
            dedupe_key=f"reply:inbound:{inbound_id}",
            reply_to=reply_to,
            subject_type="inbound_message",
            subject_id=str(inbound_id),
        )
        return result.status
