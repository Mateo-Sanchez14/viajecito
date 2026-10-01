"""A person's ski profile (sensitive: only its owner reads it through the API)."""

from ski import domain
from ski.domain import ProfileInput, ProfileRecord
from ski.ports import SkiStore


def get_my_profile(person_id: str, store: SkiStore) -> ProfileRecord:
    """The saved profile, or the defaults (nothing is created by a read)."""
    existing = store.get_profile(person_id)
    if existing is not None:
        return existing
    default = ProfileInput()
    return ProfileRecord(
        person_id=person_id,
        discipline=default.discipline,
        level=default.level,
        boot_size_eu=None,
        height_cm=None,
        weight_kg=None,
        share_sizes_with_trip=False,
        owns_gear=False,
    )


def save_my_profile(person_id: str, profile: ProfileInput, store: SkiStore) -> ProfileRecord:
    return store.save_profile(person_id, domain.validate_profile(profile))
