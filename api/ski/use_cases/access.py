"""Who can use the ski module."""

from trips import plugins


def ski_enabled(trip_type: str) -> bool:
    """Whether trips of this type expose the ``ski`` module."""
    return "ski" in plugins.modules_for(trip_type)
