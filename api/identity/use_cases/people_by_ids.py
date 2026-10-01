from identity.domain import PersonData
from identity.ports import IdentityDirectory


def people_by_ids(person_ids: list[str], directory: IdentityDirectory) -> list[PersonData]:
    """The known people among ``person_ids`` (unknown ids are simply absent)."""
    return directory.people_by_ids(person_ids)
