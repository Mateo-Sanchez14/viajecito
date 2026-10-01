"""Trip-type plugin registry (pure; no Django).

A trip type decides which modules a trip exposes. Core registers ``generic``; other apps register
their own type from ``AppConfig.ready()``.
"""

import logging
from dataclasses import dataclass

from trips.domain import DEFAULT_TRIP_TYPE

logger = logging.getLogger(__name__)


class DuplicatePluginError(ValueError):
    """A plugin is already registered under this key."""


@dataclass(frozen=True)
class TripTypePlugin:
    key: str
    label_key: str
    modules: tuple[str, ...]
    packing_templates: tuple[str, ...] = ()
    reminder_rules: tuple[str, ...] = ()


GENERIC = TripTypePlugin(
    key=DEFAULT_TRIP_TYPE,
    label_key="trip_types.generic",
    modules=("proposals", "dates", "logistics", "itinerary", "today", "budget", "documents"),
)

_REGISTRY: dict[str, TripTypePlugin] = {}


def register(plugin: TripTypePlugin) -> None:
    """Register a trip type. The same plugin again is a no-op (``ready()`` may run twice);
    a different plugin under a used key raises ``DuplicatePluginError``."""
    existing = _REGISTRY.get(plugin.key)
    if existing is None:
        _REGISTRY[plugin.key] = plugin
    elif existing != plugin:
        raise DuplicatePluginError(f"trip type {plugin.key!r} is already registered")


def get(key: str) -> TripTypePlugin:
    return _REGISTRY[key]


def all() -> list[TripTypePlugin]:
    return list(_REGISTRY.values())


def is_registered(key: str) -> bool:
    return key in _REGISTRY


def modules_for(trip_type: str) -> list[str]:
    """Modules of a trip type; unknown keys (e.g. a removed plugin) fall back to ``generic``."""
    plugin = _REGISTRY.get(trip_type)
    if plugin is None:
        logger.warning("unknown trip type %r; falling back to %r", trip_type, DEFAULT_TRIP_TYPE)
        plugin = _REGISTRY[DEFAULT_TRIP_TYPE]
    return list(plugin.modules)
