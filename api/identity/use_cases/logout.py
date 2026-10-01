from collections.abc import Callable


def logout(end_session: Callable[[], None]) -> None:
    """End the caller's session through the supplied adapter."""
    end_session()
