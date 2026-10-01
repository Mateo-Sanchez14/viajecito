"""Per-person push preferences. A missing row means enabled."""

from collections.abc import Mapping

CATEGORIES = ("all", "reminders", "digest", "countdown", "proposals")


class InvalidPreferencesError(ValueError):
    """An unknown category or a non-boolean value."""


def effective(stored: Mapping[str, bool]) -> dict[str, bool]:
    """Every category with its value; categories without a stored row are enabled."""
    return {category: stored.get(category, True) for category in CATEGORIES}


def is_enabled(stored: Mapping[str, bool], category: str) -> bool:
    """``all`` switched off silences every category."""
    return stored.get("all", True) and stored.get(category, True)


def validate_changes(changes: Mapping[str, object]) -> dict[str, bool]:
    unknown = set(changes) - set(CATEGORIES)
    if unknown:
        raise InvalidPreferencesError(f"unknown categories: {', '.join(sorted(unknown))}")
    if not all(isinstance(value, bool) for value in changes.values()):
        raise InvalidPreferencesError("preference values must be booleans")
    return dict(changes)  # type: ignore[arg-type]
