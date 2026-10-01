import pytest

from messaging import router
from messaging.handlers import commands


@pytest.fixture
def registry(monkeypatch):
    """An isolated, empty registry."""
    fresh: list = []
    monkeypatch.setattr(router, "_REGISTRY", fresh)
    return fresh


def named(label):
    def handler(ctx):
        return None

    handler.__name__ = label
    return handler


def test_chain_is_sorted_by_order_not_by_registration(registry):
    late, early, middle = named("late"), named("early"), named("middle")
    router.register_handler(100, late)
    router.register_handler(10, early)
    router.register_handler(30, middle)
    assert router.handler_chain() == [early, middle, late]


def test_same_order_keeps_registration_order(registry):
    first, second = named("first"), named("second")
    router.register_handler(20, first)
    router.register_handler(20, second)
    assert router.handler_chain() == [first, second]


def test_registering_the_same_handler_at_the_same_order_twice_is_a_no_op(registry):
    handler = named("h")
    router.register_handler(10, handler)
    router.register_handler(10, handler)
    assert router.handler_chain() == [handler]


def test_chain_is_a_copy(registry):
    router.register_handler(10, named("h"))
    router.handler_chain().clear()
    assert len(router.handler_chain()) == 1


def test_messaging_registers_the_commands_handler_at_order_10_on_ready():
    # The real registry (no fixture): MessagingConfig.ready() registered it.
    assert commands.handle in router.handler_chain()
    assert (10, commands.handle) in router.registered()
