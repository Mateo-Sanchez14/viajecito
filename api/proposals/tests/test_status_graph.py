import itertools
from datetime import UTC, datetime, timedelta

import pytest

from proposals.domain.status import (
    OPEN_STATUSES,
    STATUSES,
    InvalidTransitionError,
    Stamps,
    allowed_transitions,
    apply_stamps,
    transition,
)

NOW = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)
EARLIER = NOW - timedelta(days=2)

ALLOWED = {
    ("proposed", "discussing"),
    ("proposed", "chosen"),
    ("proposed", "discarded"),
    ("discussing", "chosen"),
    ("discussing", "discarded"),
    ("discussing", "proposed"),
    ("chosen", "booked"),
    ("chosen", "discussing"),
    ("chosen", "discarded"),
    ("booked", "chosen"),
    ("booked", "discarded"),
    ("discarded", "proposed"),
}


def test_statuses_and_open_statuses():
    assert STATUSES == ("proposed", "discussing", "chosen", "booked", "discarded")
    assert OPEN_STATUSES == ("proposed", "discussing", "chosen")


@pytest.mark.parametrize(("current", "to"), sorted(ALLOWED))
def test_every_allowed_edge(current, to):
    result = transition(current, to)
    assert (result.from_status, result.to_status, result.noop) == (current, to, False)


@pytest.mark.parametrize(
    ("current", "to"),
    sorted(
        (a, b) for a, b in itertools.product(STATUSES, STATUSES) if a != b and (a, b) not in ALLOWED
    ),
)
def test_every_forbidden_edge(current, to):
    with pytest.raises(InvalidTransitionError) as raised:
        transition(current, to)
    assert (raised.value.from_status, raised.value.to_status) == (current, to)


@pytest.mark.parametrize("status", STATUSES)
def test_same_status_is_an_idempotent_noop(status):
    result = transition(status, status)
    assert result.noop
    assert (result.from_status, result.to_status) == (status, status)


def test_unknown_statuses_are_invalid():
    with pytest.raises(InvalidTransitionError):
        transition("proposed", "nope")
    with pytest.raises(InvalidTransitionError):
        transition("nope", "proposed")


def test_allowed_transitions_lists_the_outgoing_edges_in_graph_order():
    assert allowed_transitions("proposed") == ["discussing", "chosen", "discarded"]
    assert allowed_transitions("discarded") == ["proposed"]
    assert allowed_transitions("booked") == ["chosen", "discarded"]


# --- timestamps -------------------------------------------------------------------------------


def stamps(**kw) -> Stamps:
    return Stamps(**kw)


def test_choosing_sets_chosen_at():
    result = apply_stamps(stamps(), "proposed", "chosen", NOW)
    assert result == Stamps(chosen_at=NOW)


def test_booking_sets_booked_at_and_keeps_chosen_at():
    result = apply_stamps(stamps(chosen_at=EARLIER), "chosen", "booked", NOW)
    assert result == Stamps(chosen_at=EARLIER, booked_at=NOW)


def test_unbooking_clears_booked_at_and_keeps_the_original_chosen_at():
    result = apply_stamps(stamps(chosen_at=EARLIER, booked_at=EARLIER), "booked", "chosen", NOW)
    assert result == Stamps(chosen_at=EARLIER)


def test_reopening_from_chosen_clears_the_choice():
    result = apply_stamps(stamps(chosen_at=EARLIER), "chosen", "discussing", NOW)
    assert result == Stamps()


def test_discarding_sets_discarded_at_and_keeps_the_history():
    result = apply_stamps(stamps(chosen_at=EARLIER, booked_at=EARLIER), "booked", "discarded", NOW)
    assert result == Stamps(chosen_at=EARLIER, booked_at=EARLIER, discarded_at=NOW)


def test_reopening_a_discarded_proposal_resets_every_timestamp():
    result = apply_stamps(
        stamps(chosen_at=EARLIER, booked_at=EARLIER, discarded_at=EARLIER),
        "discarded",
        "proposed",
        NOW,
    )
    assert result == Stamps()


def test_reopening_discussion_to_proposed_clears_nothing_that_is_set():
    assert apply_stamps(stamps(), "discussing", "proposed", NOW) == Stamps()
