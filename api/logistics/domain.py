from datetime import datetime
from typing import Any


class LogisticsError(ValueError):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def validate_task(fields: dict[str, Any], current=None):
    data = {**(current or {}), **fields}
    if not isinstance(data.get("title"), str) or not 1 <= len(data["title"].strip()) <= 200:
        raise LogisticsError("invalid_request", "Title must contain 1–200 characters")
    if len(data.get("notes", "")) > 2000 or data.get("kind", "todo") not in (
        "todo",
        "bring",
        "booking",
    ):
        raise LogisticsError("invalid_request", "Invalid task fields")
    if data.get("status", "open") not in ("open", "done", "blocked"):
        raise LogisticsError("invalid_request", "Invalid task status")
    if current and current["status"] == "done" and data.get("status") == "blocked":
        raise LogisticsError("invalid_request", "Reopen a completed task before blocking it")
    quantity = data.get("quantity")
    if quantity is not None and (isinstance(quantity, bool) or not 1 <= quantity <= 32767):
        raise LogisticsError("invalid_request", "Quantity must be positive")
    return {**fields, **({"title": data["title"].strip()} if "title" in fields else {})}


def transition_changes(current, fields, actor_id: str, now: datetime):
    changes = validate_task(fields, current)
    if "status" in changes and changes["status"] != current["status"]:
        changes.update(
            done_at=now if changes["status"] == "done" else None,
            done_by_id=actor_id if changes["status"] == "done" else None,
        )
    owner_changed = "owner_id" in changes and (
        str(changes["owner_id"]) if changes["owner_id"] is not None else None
    ) != (str(current["owner_id"]) if current.get("owner_id") is not None else None)
    due_changed = "due_on" in changes and changes["due_on"] != current.get("due_on")
    if owner_changed or due_changed:
        changes.update(nudge_count=0, last_nudged_at=None)
    return changes
