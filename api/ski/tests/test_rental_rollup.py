from decimal import Decimal

from ski.domain import GearRecord, ProfileRecord, rental_rollup


def gear(person, item, mode):
    return GearRecord(person, item, mode, None, "USD", "")


def profile(person, share, boot="42.5", height=180, weight=75):
    return ProfileRecord(person, "ski", "intermediate", Decimal(boot), height, weight, share)


def test_counts_rentals_per_item():
    rows = [
        gear("ana", "skis", "rent"),
        gear("beto", "skis", "rent"),
        gear("beto", "helmet", "rent"),
        gear("cami", "skis", "own"),
        gear("cami", "boots", "borrow"),
    ]
    rollup = rental_rollup(rows, [])
    assert rollup.rent_counts == {"skis": 2, "helmet": 1}


def test_sizes_are_shared_only_with_consent():
    rows = [gear("ana", "skis", "rent"), gear("beto", "boots", "rent")]
    profiles = [profile("ana", True, boot="38.0", height=165, weight=60), profile("beto", False)]
    rollup = rental_rollup(rows, profiles)
    assert [(s.person_id, s.boot_size_eu, s.height_cm, s.weight_kg) for s in rollup.sizes] == [
        ("ana", Decimal("38.0"), 165, 60)
    ]
    assert rollup.sizes_hidden == 1


def test_renters_without_a_profile_count_as_hidden():
    rollup = rental_rollup([gear("ana", "skis", "rent")], [])
    assert rollup.sizes == [] and rollup.sizes_hidden == 1


def test_people_who_do_not_rent_never_expose_sizes_nor_count_as_hidden():
    rows = [gear("ana", "skis", "own"), gear("beto", "skis", "borrow")]
    rollup = rental_rollup(rows, [profile("ana", True), profile("beto", False)])
    assert rollup.sizes == [] and rollup.sizes_hidden == 0 and rollup.rent_counts == {}


def test_a_person_renting_several_items_appears_once():
    rows = [gear("ana", "skis", "rent"), gear("ana", "boots", "rent")]
    rollup = rental_rollup(rows, [profile("ana", True)])
    assert len(rollup.sizes) == 1 and rollup.rent_counts == {"skis": 1, "boots": 1}
