import pytest

from identity.domain import MAX_TOUR_VERSION, InvalidTourVersionError, PersonData
from identity.use_cases.mark_tour_seen import mark_tour_seen

PERSON_ID = "7b9f6d52-5d3a-4c53-9a3e-1d0c3f4d9b11"


class FakeTourStateStore:
    def __init__(self) -> None:
        self.calls: list[tuple[str, int]] = []

    def raise_tour_seen_version(self, person_id: str, version: int) -> PersonData:
        self.calls.append((person_id, version))
        return PersonData(
            id=person_id,
            phone="+5491155551234",
            display_name="Mateo",
            locale="es-AR",
            tour_seen_version=version,
        )


@pytest.mark.parametrize("version", [1, 2, MAX_TOUR_VERSION])
def test_a_valid_version_is_delegated_to_the_store(version):
    store = FakeTourStateStore()

    person = mark_tour_seen(PERSON_ID, version, store)

    assert store.calls == [(PERSON_ID, version)]
    assert person.tour_seen_version == version


@pytest.mark.parametrize("version", [0, -1, MAX_TOUR_VERSION + 1])
def test_an_invalid_version_raises_and_never_reaches_the_store(version):
    store = FakeTourStateStore()

    with pytest.raises(InvalidTourVersionError):
        mark_tour_seen(PERSON_ID, version, store)

    assert store.calls == []


def test_the_storage_maximum_is_the_smallint_bound():
    assert MAX_TOUR_VERSION == 32767
