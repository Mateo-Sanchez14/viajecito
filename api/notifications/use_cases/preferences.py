from collections.abc import Mapping

from notifications.domain.preferences import effective, validate_changes
from notifications.ports import PreferenceStore


def get_preferences(person_id: str, *, store: PreferenceStore) -> dict[str, bool]:
    return effective(store.stored(person_id))


def set_preferences(
    person_id: str, changes: Mapping[str, object], *, store: PreferenceStore
) -> dict[str, bool]:
    store.save(person_id, validate_changes(changes))
    return effective(store.stored(person_id))
