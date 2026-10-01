import logging

import pytest

from trips import plugins
from trips.plugins import TripTypePlugin


@pytest.fixture
def registry(monkeypatch):
    """An isolated registry that starts with ``generic`` only."""
    fresh = {plugins.GENERIC.key: plugins.GENERIC}
    monkeypatch.setattr(plugins, "_REGISTRY", fresh)
    return fresh


def make(key="ski", modules=("proposals", "ski")):
    return TripTypePlugin(key=key, label_key="trip_types.ski", modules=modules)


def test_generic_is_registered_by_the_app_config():
    # The real registry (no fixture): TripsConfig.ready() registered it.
    assert plugins.get("generic").modules == (
        "proposals",
        "dates",
        "logistics",
        "itinerary",
        "today",
        "budget",
        "documents",
    )


def test_register_get_and_all(registry):
    ski = make()
    plugins.register(ski)
    assert plugins.get("ski") is ski
    assert {p.key for p in plugins.all()} == {"generic", "ski"}


def test_optional_fields_default_to_empty_tuples():
    plugin = make()
    assert plugin.packing_templates == () and plugin.reminder_rules == ()


def test_plugin_is_frozen():
    with pytest.raises(AttributeError):
        make().key = "other"  # type: ignore[misc]


def test_duplicate_key_is_rejected(registry):
    plugins.register(make())
    with pytest.raises(plugins.DuplicatePluginError):
        plugins.register(make(modules=("x",)))


def test_get_unknown_key_raises_keyerror(registry):
    with pytest.raises(KeyError):
        plugins.get("nope")


def test_modules_for_known_type(registry):
    plugins.register(make())
    assert plugins.modules_for("ski") == ["proposals", "ski"]


def test_modules_for_unknown_type_falls_back_to_generic_and_warns(registry, caplog):
    with caplog.at_level(logging.WARNING, logger="trips.plugins"):
        modules = plugins.modules_for("martian")
    assert modules == list(plugins.GENERIC.modules)
    assert "martian" in caplog.text


def test_modules_for_returns_a_copy(registry):
    plugins.modules_for("generic").append("junk")
    assert "junk" not in plugins.modules_for("generic")
