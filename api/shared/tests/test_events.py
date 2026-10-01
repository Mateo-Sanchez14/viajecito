import logging

import pytest
from django.db import transaction

from shared import events
from shared.events_django import publish_after_commit


@pytest.fixture(autouse=True)
def clean_registry():
    events.clear()
    yield
    events.clear()


def test_subscribers_are_called_in_registration_order_with_the_payload():
    calls = []
    events.subscribe("trips.trip_created", lambda **p: calls.append(("a", p)))
    events.subscribe("trips.trip_created", lambda **p: calls.append(("b", p)))
    events.publish("trips.trip_created", trip_id="t1", crew_id="c1")
    assert calls == [
        ("a", {"trip_id": "t1", "crew_id": "c1"}),
        ("b", {"trip_id": "t1", "crew_id": "c1"}),
    ]


def test_only_subscribers_of_that_event_are_called():
    calls = []
    events.subscribe("a.thing_happened", lambda **p: calls.append("a"))
    events.subscribe("b.thing_happened", lambda **p: calls.append("b"))
    events.publish("b.thing_happened")
    assert calls == ["b"]


def test_publishing_without_subscribers_is_a_no_op():
    events.publish("nobody.listens_happened", x=1)


def test_a_failing_subscriber_propagates_and_stops_the_chain():
    calls = []

    def boom(**payload):
        raise RuntimeError("kaput")

    events.subscribe("x.thing_happened", lambda **p: calls.append(1))
    events.subscribe("x.thing_happened", boom)
    events.subscribe("x.thing_happened", lambda **p: calls.append(2))
    with pytest.raises(RuntimeError, match="kaput"):
        events.publish("x.thing_happened")
    assert calls == [1]


def test_subscribing_the_same_callable_twice_is_a_no_op():
    calls = []

    def once(**payload):
        calls.append(payload)

    events.subscribe("x.thing_happened", once)
    events.subscribe("x.thing_happened", once)
    events.publish("x.thing_happened", n=1)
    assert calls == [{"n": 1}]
    assert events.subscribers("x.thing_happened") == (once,)


def test_subscribers_is_an_immutable_snapshot():
    assert events.subscribers("nobody.listens_happened") == ()
    handler = lambda **p: None  # noqa: E731
    events.subscribe("x.thing_happened", handler)
    snapshot = events.subscribers("x.thing_happened")
    events.subscribe("x.thing_happened", lambda **p: None)
    assert snapshot == (handler,)


def test_isolated_swaps_in_an_empty_registry_and_restores_the_previous_one():
    calls = []
    events.subscribe("x.thing_happened", lambda **p: calls.append("outer"))
    with events.isolated():
        assert events.subscribers("x.thing_happened") == ()
        events.subscribe("x.thing_happened", lambda **p: calls.append("inner"))
        events.publish("x.thing_happened")
    events.publish("x.thing_happened")
    assert calls == ["inner", "outer"]


def test_isolated_restores_the_registry_when_the_block_raises():
    handler = lambda **p: None  # noqa: E731
    events.subscribe("x.thing_happened", handler)
    with pytest.raises(RuntimeError), events.isolated():
        raise RuntimeError
    assert events.subscribers("x.thing_happened") == (handler,)


def test_clear_removes_every_subscriber():
    calls = []
    events.subscribe("x.thing_happened", lambda **p: calls.append(1))
    events.clear()
    events.publish("x.thing_happened")
    assert calls == []


@pytest.mark.django_db(transaction=True)
def test_publish_after_commit_is_deferred_inside_atomic_and_immediate_outside():
    calls = []
    events.subscribe("x.thing_happened", lambda **p: calls.append(p))
    with transaction.atomic():
        publish_after_commit("x.thing_happened", n=1)
        assert calls == []
    assert calls == [{"n": 1}]
    publish_after_commit("x.thing_happened", n=2)
    assert calls == [{"n": 1}, {"n": 2}]


@pytest.mark.django_db(transaction=True)
def test_publish_after_commit_is_dropped_when_the_transaction_rolls_back():
    calls = []
    events.subscribe("x.thing_happened", lambda **p: calls.append(p))
    with pytest.raises(RuntimeError), transaction.atomic():
        publish_after_commit("x.thing_happened", n=1)
        raise RuntimeError
    assert calls == []


@pytest.mark.django_db(transaction=True)
def test_publish_after_commit_isolates_failing_subscribers(caplog):
    calls = []

    def boom(**payload):
        raise RuntimeError("kaput")

    events.subscribe("x.thing_happened", boom)
    events.subscribe("x.thing_happened", lambda **p: calls.append(p))
    with caplog.at_level(logging.ERROR, logger="shared.events_django"):
        with transaction.atomic():
            publish_after_commit("x.thing_happened", n=1)
    assert calls == [{"n": 1}]  # each subscriber is isolated: the later one still ran
    assert "kaput" in caplog.text and "x.thing_happened" in caplog.text
