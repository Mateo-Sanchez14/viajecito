"""The proposal status graph and its timestamp side effects (pure)."""

from dataclasses import dataclass
from datetime import datetime

STATUSES = ("proposed", "discussing", "chosen", "booked", "discarded")
OPEN_STATUSES = ("proposed", "discussing", "chosen")  # still being decided or about to be booked
PROPOSAL_COMPLETED = "booked"

_GRAPH: dict[str, tuple[str, ...]] = {
    "proposed": ("discussing", "chosen", "discarded"),
    "discussing": ("chosen", "discarded", "proposed"),  # proposed = reopen
    "chosen": ("booked", "discussing", "discarded"),  # discussing = reopen
    "booked": ("chosen", "discarded"),  # chosen = unbook
    "discarded": ("proposed",),  # reopen
}


class InvalidTransitionError(ValueError):
    def __init__(self, from_status: str, to_status: str) -> None:
        super().__init__(f"cannot move a proposal from {from_status!r} to {to_status!r}")
        self.from_status = from_status
        self.to_status = to_status


@dataclass(frozen=True)
class Transition:
    from_status: str
    to_status: str
    noop: bool  # ``to == current``: nothing changes and no event is published


@dataclass(frozen=True)
class Stamps:
    chosen_at: datetime | None = None
    booked_at: datetime | None = None
    discarded_at: datetime | None = None


def allowed_transitions(current: str) -> list[str]:
    return list(_GRAPH.get(current, ()))


def transition(current: str, to: str) -> Transition:
    """Validate ``current -> to``; the same status is an idempotent no-op."""
    if current not in _GRAPH or to not in _GRAPH:
        raise InvalidTransitionError(current, to)
    if to == current:
        return Transition(current, to, noop=True)
    if to not in _GRAPH[current]:
        raise InvalidTransitionError(current, to)
    return Transition(current, to, noop=False)


def apply_stamps(stamps: Stamps, from_status: str, to_status: str, now: datetime) -> Stamps:
    """The timestamps after ``from_status -> to_status``.

    Choosing sets ``chosen_at`` (kept when un-booking), booking sets ``booked_at``, discarding sets
    ``discarded_at`` and keeps the history, and every reopen (back to proposed/discussing) clears
    them all.
    """
    if to_status == "chosen":
        chosen_at = stamps.chosen_at if from_status == "booked" else now
        return Stamps(chosen_at=chosen_at)
    if to_status == "booked":
        return Stamps(chosen_at=stamps.chosen_at, booked_at=now)
    if to_status == "discarded":
        return Stamps(stamps.chosen_at, stamps.booked_at, discarded_at=now)
    return Stamps()
