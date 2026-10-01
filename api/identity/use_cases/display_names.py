from identity import ports
from identity.use_cases.people_by_ids import people_by_ids


def display_names(person_ids: list[str]) -> dict[str, str]:
    """``{person_id: display name}`` (the E.164 phone when they have none).

    Unknown or malformed ids are simply absent from the result.
    """
    if not person_ids:
        return {}
    people = people_by_ids(person_ids, ports.default_directory())
    return {p.id: p.display_name or p.phone for p in people}
