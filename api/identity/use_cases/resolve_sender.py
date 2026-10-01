from identity.ports import IdentityDirectory


def resolve_person_id(jid: str, lid: str, directory: IdentityDirectory) -> str | None:
    """The person behind a WhatsApp sender: by phone JID first, then by LID."""
    if jid and (person_id := directory.person_id_by_jid(jid)):
        return person_id
    if lid and (person_id := directory.person_id_by_lid(lid)):
        return person_id
    return None
