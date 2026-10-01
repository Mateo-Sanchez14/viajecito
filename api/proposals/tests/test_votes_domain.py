from proposals.domain.tally import compute_tally


def test_counts_every_vote_but_majority_only_counts_participants_in():
    votes = [("a", 1), ("b", 1), ("c", 1), ("d", 0), ("e", -1)]
    tally = compute_tally(votes, in_ids={"a", "b", "d"}, me="e")
    assert (tally.up, tally.neutral, tally.down, tally.score) == (3, 1, 1, 2)
    assert tally.my_vote == -1
    # in_count = 3, up from `in` = 2 > 1.5
    assert tally.majority
    assert tally.up_in == 2
    assert tally.in_count == 3


def test_majority_needs_more_than_half_and_at_least_two_in():
    assert not compute_tally([("a", 1)], in_ids={"a"}, me=None).majority  # in_count < 2
    assert not compute_tally([("a", 1), ("b", 0)], in_ids={"a", "b"}, me=None).majority  # 1 of 2
    assert compute_tally([("a", 1), ("b", 1)], in_ids={"a", "b"}, me=None).majority  # 2 of 2
    assert not compute_tally([("a", 1), ("b", 1)], in_ids={"a", "b", "c", "d"}, me=None).majority
    assert compute_tally(
        [("a", 1), ("b", 1), ("c", 1)], in_ids={"a", "b", "c", "d"}, me=None
    ).majority


def test_votes_from_people_who_are_not_in_never_make_a_majority():
    votes = [("x", 1), ("y", 1), ("z", 1)]
    tally = compute_tally(votes, in_ids={"a", "b"}, me=None)
    assert tally.up == 3
    assert not tally.majority


def test_my_vote_is_none_without_a_vote_and_zero_is_a_vote():
    assert compute_tally([], in_ids=set(), me="a").my_vote is None
    assert compute_tally([("a", 0)], in_ids=set(), me="a").my_vote == 0
