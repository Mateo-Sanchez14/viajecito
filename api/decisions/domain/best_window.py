"""Pure best-window ranking for a dates decision (no Django, no HTTP)."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from itertools import accumulate
from typing import Literal

Answer = Literal["yes", "maybe", "no"]
DEFAULT_MAYBE_WEIGHT = Decimal("0.5")


@dataclass(frozen=True)
class WindowScore:
    start: date
    end: date
    days: int
    avg_score: Decimal  # yes_score / days: higher is better
    yes_score: Decimal  # sum over people x days (yes=1, maybe=maybe_weight, no/missing=0)
    no_count: int  # person-days answered "no"
    blocked_people: tuple[str, ...]  # at least one "no" in the window
    full_people: tuple[str, ...]  # every day answered yes or maybe
    weekend_days: int
    missing_people: tuple[str, ...]  # no answer at all in the window


def _prefix(values: Sequence[int | Decimal]) -> list:
    return [0, *accumulate(values)]


def best_windows(
    *,
    window_start: date,
    window_end: date,
    min_days: int,
    max_days: int,
    people: Sequence[str],
    answers: Mapping[tuple[str, date], Answer],
    maybe_weight: Decimal = DEFAULT_MAYBE_WEIGHT,
    limit: int = 3,
) -> list[WindowScore]:
    """The ``limit`` best windows of ``min_days..max_days`` days (inclusive) inside the range.

    Ranking: highest ``avg_score``, then fewest ``no_count``, then most ``weekend_days``, then
    longest, then earliest start. Answers outside the range or from people not listed are ignored.
    """
    if window_end < window_start:
        raise ValueError("window_end must not be before window_start")
    if min_days < 1 or max_days < min_days:
        raise ValueError("lengths must satisfy 1 <= min_days <= max_days")
    if limit <= 0:
        return []

    total = (window_end - window_start).days + 1
    dates = [window_start + timedelta(days=i) for i in range(total)]
    weights = {"yes": Decimal(1), "maybe": maybe_weight, "no": Decimal(0)}

    # Per-person prefix sums over the range make every window O(people).
    nos, answered, available = [], [], []
    day_scores = [Decimal(0)] * total
    for person in people:
        given = [answers.get((person, d)) for d in dates]
        nos.append(_prefix([a == "no" for a in given]))
        answered.append(_prefix([a is not None for a in given]))
        available.append(_prefix([a in ("yes", "maybe") for a in given]))
        for i, a in enumerate(given):
            if a is not None:
                day_scores[i] += weights[a]
    score_prefix = _prefix(day_scores)
    weekend_prefix = _prefix([d.weekday() >= 5 for d in dates])

    scored: list[WindowScore] = []
    for length in range(min_days, min(max_days, total) + 1):
        for first in range(total - length + 1):
            last = first + length
            blocked, full, missing = [], [], []
            no_count = 0
            for index, person in enumerate(people):
                person_nos = nos[index][last] - nos[index][first]
                no_count += person_nos
                if person_nos:
                    blocked.append(person)
                if available[index][last] - available[index][first] == length:
                    full.append(person)
                if answered[index][last] == answered[index][first]:
                    missing.append(person)
            yes_score = score_prefix[last] - score_prefix[first]
            scored.append(
                WindowScore(
                    start=dates[first],
                    end=dates[last - 1],
                    days=length,
                    avg_score=yes_score / length,
                    yes_score=yes_score,
                    no_count=no_count,
                    blocked_people=tuple(blocked),
                    full_people=tuple(full),
                    weekend_days=weekend_prefix[last] - weekend_prefix[first],
                    missing_people=tuple(missing),
                )
            )
    scored.sort(key=lambda w: (-w.avg_score, w.no_count, -w.weekend_days, -w.days, w.start))
    return scored[:limit]
