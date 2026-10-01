import random
from datetime import date, timedelta
from decimal import Decimal

import pytest

from decisions.domain.best_window import WindowScore, best_windows

# July 2026: Wed 1, Sat 4, Sun 5, Mon 6 ... Sat 11, Sun 12.
START = date(2026, 7, 1)


def day(n: int) -> date:
    """Day ``n`` of July 2026 (1-based)."""
    return START + timedelta(days=n - 1)


def run(*, end=10, min_days=2, max_days=None, people=("a",), answers=None, **kwargs):
    return best_windows(
        window_start=START,
        window_end=day(end),
        min_days=min_days,
        max_days=max_days or min_days,
        people=list(people),
        answers=answers or {},
        **kwargs,
    )


def answers_for(person, spec):
    """``{day_number: answer}`` -> the mapping the algorithm takes."""
    return {(person, day(n)): answer for n, answer in spec.items()}


def span(window: WindowScore) -> tuple[int, int]:
    return window.start.day, window.end.day


def test_single_best_window():
    answers = answers_for("a", {5: "yes", 6: "yes", 7: "yes"})
    top = run(min_days=3, answers=answers)[0]
    assert span(top) == (5, 7)
    assert top.days == 3 and top.avg_score == Decimal(1) and top.yes_score == Decimal(3)
    assert top.no_count == 0 and top.full_people == ("a",) and top.missing_people == ()


def test_returns_at_most_limit_windows_best_first():
    answers = answers_for("a", {1: "yes", 2: "yes", 3: "yes"})
    windows = run(min_days=1, max_days=3, answers=answers, limit=2)
    assert [span(w) for w in windows] == [(1, 3), (1, 2)]
    assert len(run(min_days=1, max_days=3, answers=answers)) == 3  # default limit


def test_fewer_no_wins_a_score_tie():
    # [4,5] scores 2 with no "no"; [1,2] scores 2 too but person b said "no" on both days.
    answers = answers_for("a", {1: "yes", 2: "yes", 4: "yes", 5: "yes"})
    answers |= answers_for("b", {1: "no", 2: "no"})
    windows = run(end=5, people=("a", "b"), answers=answers, limit=10)
    assert [span(w) for w in windows[:2]] == [(4, 5), (1, 2)]
    assert windows[0].avg_score == windows[1].avg_score == Decimal(1)
    assert (windows[0].no_count, windows[1].no_count) == (0, 2)


def test_weekend_overlap_breaks_a_tie():
    windows = run(end=8, min_days=2, limit=10)  # nobody answered: every window scores 0
    assert span(windows[0]) == (4, 5)  # Sat-Sun
    assert windows[0].weekend_days == 2
    assert [w.weekend_days for w in windows] == sorted(
        (w.weekend_days for w in windows), reverse=True
    )


def test_longer_window_breaks_a_remaining_tie_then_earlier_start():
    # Mon 6 .. Thu 9: no weekend day in any scored window, everything inside is a yes.
    answers = answers_for("a", {6: "yes", 7: "yes", 8: "yes", 9: "yes"})
    windows = run(end=9, min_days=2, max_days=4, answers=answers, limit=10)
    ranked = [span(w) for w in windows if w.avg_score == 1]
    assert ranked == [(6, 9), (6, 8), (7, 9), (6, 7), (7, 8), (8, 9)]


def test_a_single_no_ranks_below_missing_data_at_the_same_score():
    # Same yes_score, but the window with a "no" loses to the one where the person never answered.
    answers = answers_for("a", {1: "yes", 2: "yes", 4: "yes", 5: "yes"})
    answers |= answers_for("b", {2: "no"})
    windows = run(end=5, people=("a", "b"), answers=answers, limit=10)
    by_span = {span(w): w for w in windows}
    assert by_span[(4, 5)].avg_score == by_span[(1, 2)].avg_score
    assert windows.index(by_span[(4, 5)]) < windows.index(by_span[(1, 2)])
    assert by_span[(4, 5)].missing_people == ("b",)
    assert by_span[(1, 2)].blocked_people == ("b",)


def test_every_length_between_min_and_max_is_a_candidate():
    windows = run(end=6, min_days=2, max_days=4, limit=1000)
    assert {w.days for w in windows} == {2, 3, 4}
    assert len(windows) == 5 + 4 + 3  # 6-day range: 5 starts for 2, 4 for 3, 3 for 4
    assert all(w.start >= START and w.end <= day(6) for w in windows)
    assert all(w.days == (w.end - w.start).days + 1 for w in windows)


def test_min_length_is_enforced():
    windows = run(end=10, min_days=4, max_days=4, limit=1000)
    assert {w.days for w in windows} == {4}
    assert len(windows) == 7


def test_range_shorter_than_min_days_has_no_windows():
    assert run(end=3, min_days=4, max_days=5) == []


def test_max_days_beyond_the_range_only_yields_what_fits():
    windows = run(end=3, min_days=2, max_days=10, limit=100)
    assert {w.days for w in windows} == {2, 3}


@pytest.mark.parametrize(
    ("maybe_weight", "expected_top", "expected_avg"),
    [
        (Decimal("0"), (1, 2), Decimal("0.5")),
        (Decimal("0.25"), (1, 2), Decimal("0.5")),
        (Decimal("0.75"), (4, 5), Decimal("0.75")),
        (Decimal("1"), (4, 5), Decimal("1")),
    ],
)
def test_maybe_weighting_changes_the_ranking(maybe_weight, expected_top, expected_avg):
    answers = answers_for("a", {1: "yes"})  # [1,2] = one yes
    answers |= answers_for("b", {4: "maybe", 5: "maybe"})  # [4,5] = two maybes
    windows = run(end=5, people=("a", "b"), answers=answers, maybe_weight=maybe_weight, limit=5)
    assert span(windows[0]) == expected_top
    assert windows[0].avg_score == expected_avg


def test_maybe_counts_as_available_for_full_people_but_not_as_a_no():
    answers = answers_for("a", {1: "maybe", 2: "yes"})
    top = run(end=2, answers=answers)[0]
    assert top.full_people == ("a",) and top.blocked_people == () and top.no_count == 0


def test_blocked_full_and_missing_people_are_reported_in_people_order():
    answers = answers_for("a", {1: "yes", 2: "yes"})
    answers |= answers_for("b", {1: "yes", 2: "no"})
    answers |= answers_for("c", {2: "yes"})  # day 1 left blank: neither full nor missing
    top = run(end=2, people=("a", "b", "c", "d"), answers=answers)[0]
    assert top.full_people == ("a",)
    assert top.blocked_people == ("b",)
    assert top.missing_people == ("d",)
    assert top.no_count == 1
    assert top.yes_score == Decimal(4)
    assert top.avg_score == Decimal(2)


def test_answers_outside_the_range_or_from_strangers_are_ignored():
    answers = answers_for("a", {1: "yes", 2: "yes"})
    answers |= {("a", day(20)): "no", ("ghost", day(1)): "no", ("ghost", day(2)): "yes"}
    top = run(end=3, people=("a",), answers=answers)[0]
    assert span(top) == (1, 2) and top.no_count == 0 and top.yes_score == Decimal(2)


def test_no_people_and_no_answers_still_rank_windows_by_the_tie_breaks():
    windows = run(end=8, people=(), limit=3)
    assert span(windows[0]) == (4, 5)
    assert all(w.avg_score == 0 and w.no_count == 0 for w in windows)
    assert all(w.full_people == w.blocked_people == w.missing_people == () for w in windows)


def test_result_does_not_depend_on_input_order():
    answers = answers_for("a", {1: "yes", 3: "maybe"}) | answers_for("b", {2: "no", 5: "yes"})
    answers |= answers_for("c", {4: "yes", 5: "yes", 6: "no"})
    canonical = run(
        end=9, min_days=2, max_days=3, people=("a", "b", "c"), answers=answers, limit=50
    )

    def shape(windows):
        return [
            (
                w.start,
                w.end,
                w.avg_score,
                w.no_count,
                w.weekend_days,
                set(w.full_people),
                set(w.blocked_people),
                set(w.missing_people),
            )
            for w in windows
        ]

    rng = random.Random(7)
    for _ in range(10):
        people = ["a", "b", "c"]
        rng.shuffle(people)
        items = list(answers.items())
        rng.shuffle(items)
        shuffled = run(end=9, min_days=2, max_days=3, people=people, answers=dict(items), limit=50)
        assert shape(shuffled) == shape(canonical)


def test_windows_cross_month_boundaries():
    # Thu 30 Jul .. Mon 3 Aug 2026; Sat 1 Aug and Sun 2 Aug are the weekend.
    start = date(2026, 7, 30)
    answers = {("a", start + timedelta(days=i)): "yes" for i in range(5)}
    windows = best_windows(
        window_start=start,
        window_end=date(2026, 8, 3),
        min_days=5,
        max_days=5,
        people=["a"],
        answers=answers,
    )
    assert [(w.start, w.end, w.days, w.weekend_days) for w in windows] == [
        (date(2026, 7, 30), date(2026, 8, 3), 5, 2)
    ]
    short = best_windows(
        window_start=start,
        window_end=date(2026, 8, 3),
        min_days=3,
        max_days=3,
        people=["a"],
        answers=answers,
        limit=1,
    )
    assert (short[0].start, short[0].end) == (date(2026, 7, 31), date(2026, 8, 2))  # most weekend


@pytest.mark.parametrize("kwargs", [{"min_days": 0}, {"min_days": 3, "max_days": 2}])
def test_invalid_lengths_raise(kwargs):
    with pytest.raises(ValueError):
        run(**kwargs)


def test_end_before_start_raises():
    with pytest.raises(ValueError):
        best_windows(
            window_start=day(5), window_end=day(1), min_days=1, max_days=1, people=[], answers={}
        )


def test_non_positive_limit_returns_nothing():
    assert run(limit=0) == []


def naive(start, end, min_days, max_days, people, answers, weight, limit):
    """Straight-from-the-contract oracle (slow, obvious)."""
    scores = []
    total_days = (end - start).days + 1
    for length in range(min_days, max_days + 1):
        for offset in range(total_days - length + 1):
            first = start + timedelta(days=offset)
            days = [first + timedelta(days=i) for i in range(length)]
            value = {"yes": Decimal(1), "maybe": weight, "no": Decimal(0)}
            yes_score = Decimal(0)
            no_count = 0
            blocked, full, missing = [], [], []
            for p in people:
                given = [answers.get((p, d)) for d in days]
                yes_score += sum((value[a] for a in given if a), Decimal(0))
                no_count += given.count("no")
                if "no" in given:
                    blocked.append(p)
                if all(a in ("yes", "maybe") for a in given):
                    full.append(p)
                if all(a is None for a in given):
                    missing.append(p)
            scores.append(
                WindowScore(
                    start=first,
                    end=days[-1],
                    days=length,
                    avg_score=yes_score / length,
                    yes_score=yes_score,
                    no_count=no_count,
                    blocked_people=tuple(blocked),
                    full_people=tuple(full),
                    weekend_days=sum(d.weekday() >= 5 for d in days),
                    missing_people=tuple(missing),
                )
            )
    scores.sort(key=lambda w: (-w.avg_score, w.no_count, -w.weekend_days, -w.days, w.start))
    return scores[:limit]


@pytest.mark.parametrize("seed", range(40))
def test_matches_the_naive_oracle_on_random_data(seed):
    rng = random.Random(seed)
    span_days = rng.randint(1, 25)
    min_days = rng.randint(1, 6)
    max_days = rng.randint(min_days, 9)
    people = [f"p{i}" for i in range(rng.randint(0, 5))]
    end = day(span_days)
    answers = {}
    for p in people:
        for n in range(1, span_days + 3):  # a couple of days past the range on purpose
            choice = rng.choice(["yes", "maybe", "no", None, None])
            if choice:
                answers[(p, day(n))] = choice
    weight = Decimal(rng.choice(["0", "0.25", "0.5", "0.75", "1"]))
    limit = rng.randint(1, 50)
    got = best_windows(
        window_start=START,
        window_end=end,
        min_days=min_days,
        max_days=max_days,
        people=people,
        answers=answers,
        maybe_weight=weight,
        limit=limit,
    )
    assert got == naive(START, end, min_days, max_days, people, answers, weight, limit)
