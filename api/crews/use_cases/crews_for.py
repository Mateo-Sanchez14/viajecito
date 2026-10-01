from crews.domain import CrewSummary
from crews.ports import CrewStore


def crews_for(person_id: str, store: CrewStore) -> list[CrewSummary]:
    return store.summaries_for(person_id)
