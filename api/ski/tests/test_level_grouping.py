from decimal import Decimal

from ski.domain import Participant, ProfileRecord, level_groups


def prof(person, discipline, level):
    return ProfileRecord(person, discipline, level, Decimal("42"), 180, 75, False)


P = {name: Participant(name, name.title(), "in") for name in ("ana", "beto", "cami", "dani", "eli")}


def test_groups_by_discipline_and_level():
    profiles = [
        prof("ana", "ski", "advanced"),
        prof("beto", "ski", "advanced"),
        prof("cami", "snowboard", "advanced"),
        prof("dani", "ski", "beginner"),
    ]
    groups = level_groups([P["ana"], P["beto"], P["cami"], P["dani"]], profiles)
    assert [(g.discipline, g.level, g.person_ids) for g in groups] == [
        ("ski", "beginner", ["dani"]),
        ("ski", "advanced", ["ana", "beto"]),
        ("snowboard", "advanced", ["cami"]),
    ]


def test_people_without_a_profile_or_who_are_out_are_left_out():
    out = Participant("out", "Out", "out")
    groups = level_groups(
        [P["ana"], out, P["eli"]], [prof("ana", "both", "expert"), prof("out", "ski", "expert")]
    )
    assert [(g.discipline, g.level, g.person_ids) for g in groups] == [("both", "expert", ["ana"])]


def test_maybe_participants_are_included():
    maybe = Participant("m", "Maybe", "maybe")
    groups = level_groups([maybe], [prof("m", "ski", "first_time")])
    assert groups[0].person_ids == ["m"]
