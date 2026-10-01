"""Vote tally and the majority rule (pure)."""

from collections.abc import Collection, Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class Tally:
    up: int
    neutral: int
    down: int
    my_vote: int | None
    up_in: int  # +1 votes from participants who are ``in``
    in_count: int  # participants who are ``in``

    @property
    def score(self) -> int:
        return self.up - self.down

    @property
    def majority(self) -> bool:
        """More than half of the participants who are ``in`` voted +1 (and there are >= 2)."""
        return self.in_count >= 2 and self.up_in > self.in_count / 2


def compute_tally(
    votes: Iterable[tuple[str, int]], in_ids: Collection[str], me: str | None
) -> Tally:
    """``votes`` are ``(person_id, value)``. Every vote is counted; only the +1s of participants
    with ``rsvp = in`` count toward the majority."""
    up = neutral = down = up_in = 0
    mine: int | None = None
    for person_id, value in votes:
        if value > 0:
            up += 1
            up_in += person_id in in_ids
        elif value < 0:
            down += 1
        else:
            neutral += 1
        if person_id == me:
            mine = value
    return Tally(up, neutral, down, mine, up_in, len(in_ids))
