"""Everything the ski page shows, in one read."""

from dataclasses import dataclass
from datetime import datetime

from ski import domain
from ski.domain import (
    Conditions,
    GearRecord,
    LevelGroup,
    MissingPass,
    Participant,
    PassRecord,
    RentalRollup,
)
from ski.ports import SkiStore
from ski.use_cases.conditions import trip_conditions


@dataclass(frozen=True)
class SkiOverview:
    resorts: list[Conditions]
    people: dict[str, str]  # person_id -> display name of every active member
    passes: list[PassRecord]
    missing: list[MissingPass]
    gear: list[GearRecord]
    rollup: RentalRollup
    levels: list[LevelGroup]


def ski_overview(trip_id: str, now: datetime, store: SkiStore) -> SkiOverview:
    """Conditions, who still needs a pass, the rental roll-up and the level groups.

    Only ``in``/``maybe`` participants count for passes, gear and levels. Other people's profiles
    reach the result only as (discipline, level) groups and, for renters who consented, sizes.
    """
    resorts = trip_conditions(trip_id, now, store)
    participants: list[Participant] = store.participants(trip_id)
    going = {p.person_id for p in participants if p.rsvp in domain.GOING_RSVPS}
    passes = [p for p in store.passes(trip_id) if p.person_id in going]
    gear = [g for g in store.gear(trip_id) if g.person_id in going]
    profiles = store.profiles(sorted(going))
    resort_ids = [c.trip_resort.resort.id for c in resorts]
    return SkiOverview(
        resorts=resorts,
        people={p.person_id: p.display_name for p in participants},
        passes=passes,
        missing=domain.missing_passes(participants, resort_ids, passes),
        gear=gear,
        rollup=domain.rental_rollup(gear, profiles),
        levels=domain.level_groups(participants, profiles),
    )
