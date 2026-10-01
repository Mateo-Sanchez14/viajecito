"""Loader of the seeded resorts (used by the data migration and ``seed_resorts``)."""

import json
from pathlib import Path

FIXTURE = Path(__file__).parent / "fixtures" / "resorts.json"
FIELDS = (
    "name",
    "country",
    "region",
    "lat",
    "lng",
    "base_elev_m",
    "summit_elev_m",
    "timezone",
    "provider",
    "provider_ref",
    "website_url",
)


def load_resorts(resort_model, path: Path = FIXTURE) -> tuple[int, int]:
    """Idempotent upsert by ``slug``; returns ``(created, updated)``.

    ``resort_model`` is passed in so a migration can hand over its historical model. Keys that are
    not model fields (``verification``: where the numbers come from) are ignored.
    """
    created = updated = 0
    for entry in json.loads(path.read_text(encoding="utf-8")):
        defaults = {key: entry[key] for key in FIELDS if key in entry}
        _, was_created = resort_model.objects.update_or_create(
            slug=entry["slug"], defaults=defaults
        )
        created += was_created
        updated += not was_created
    return created, updated
