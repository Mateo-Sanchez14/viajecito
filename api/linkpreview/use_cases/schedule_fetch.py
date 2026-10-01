from linkpreview import ports


def schedule_preview_fetch(preview_id: str) -> None:
    """Queue the unfurl of a ``pending`` preview off the request path (inline in tests)."""
    ports.default_scheduler().schedule(preview_id)
