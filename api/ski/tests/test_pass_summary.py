from decimal import Decimal

from ski.domain import Participant, PassRecord, missing_passes

ANA = Participant("ana", "Ana", "in")
BETO = Participant("beto", "Beto", "maybe")
CAMI = Participant("cami", "Cami", "out")
DANI = Participant("dani", "Dani", "pending")
CAT, CHAP = "resort-cat", "resort-chap"


def pass_(person, resort, status):
    return PassRecord(person, resort, "Pase", 5, status, Decimal("100"), "USD")


def keys(missing):
    return sorted((m.person_id, m.resort_id) for m in missing)


def test_only_in_and_maybe_participants_can_be_missing():
    missing = missing_passes([ANA, BETO, CAMI, DANI], [CAT], [])
    assert keys(missing) == [("ana", CAT), ("beto", CAT)]


def test_a_bought_pass_covers_that_resort_only():
    passes = [pass_("ana", CAT, "bought")]
    assert keys(missing_passes([ANA], [CAT, CHAP], passes)) == [("ana", CHAP)]


def test_needed_is_missing_but_season_pass_and_not_needed_are_not():
    passes = [
        pass_("ana", CAT, "needed"),
        pass_("beto", CAT, "season_pass"),
    ]
    assert keys(missing_passes([ANA, BETO], [CAT], passes)) == [("ana", CAT)]
    assert missing_passes([ANA], [CAT], [pass_("ana", CAT, "not_needed")]) == []


def test_a_resort_less_row_covers_resorts_without_their_own_row():
    passes = [pass_("ana", None, "season_pass"), pass_("beto", None, "needed")]
    missing = missing_passes([ANA, BETO], [CAT, CHAP], passes)
    assert keys(missing) == [("beto", CAT), ("beto", CHAP)]


def test_a_specific_row_wins_over_the_resort_less_one():
    passes = [pass_("ana", None, "bought"), pass_("ana", CAT, "needed")]
    assert keys(missing_passes([ANA], [CAT, CHAP], passes)) == [("ana", CAT)]


def test_a_trip_without_resorts_is_judged_on_resort_less_rows_alone():
    assert keys(missing_passes([ANA, BETO], [], [pass_("ana", None, "bought")])) == [("beto", None)]


def test_passes_of_other_resorts_are_ignored():
    passes = [pass_("ana", "elsewhere", "bought")]
    assert keys(missing_passes([ANA], [CAT], passes)) == [("ana", CAT)]
