from trips import plugins


def packing_templates(trip_type: str) -> tuple[str, ...]:
    """Read plugin-specific templates; consumers combine these with their generic template."""
    return plugins.get(trip_type).packing_templates
