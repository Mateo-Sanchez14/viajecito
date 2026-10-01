"""Other capabilities read plugin packing templates through a pure use case."""

import pytest

from trips import plugins
from trips.use_cases.packing_templates import packing_templates


def test_generic_has_no_plugin_specific_templates():
    assert packing_templates("generic") == ()


def test_registered_plugin_preserves_template_order(monkeypatch):
    plugin = plugins.TripTypePlugin(
        key="custom",
        label_key="trip_types.custom",
        modules=(),
        packing_templates=("border", "gear"),
    )
    monkeypatch.setattr(plugins, "_REGISTRY", {plugin.key: plugin})
    assert packing_templates("custom") == ("border", "gear")
    assert isinstance(packing_templates("custom"), tuple)


def test_app_config_registers_ski_templates():
    assert packing_templates("ski") == ("ski", "border")


def test_unknown_type_preserves_registry_error():
    with pytest.raises(KeyError, match="missing-type"):
        packing_templates("missing-type")
