from dataclasses import dataclass

from crews.domain import CrewSummary
from identity.domain import PersonData
from identity.ports import CrewLister


@dataclass(frozen=True)
class MeResult:
    person: PersonData
    crews: list[CrewSummary]


def me(person: PersonData, crews: CrewLister) -> MeResult:
    return MeResult(person, crews.crews_for(person.id))
