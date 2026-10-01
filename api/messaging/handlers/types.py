"""Shared types of the inbound handler chain."""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from messaging.domain import InboundRecord


@dataclass(frozen=True)
class HandlerContext:
    message: InboundRecord
    person_id: str
    reply: Callable[[str], str]  # sends a threaded reply in the group; returns its send status


@dataclass(frozen=True)
class Handled:
    """A handler claimed the message. ``detail`` is stored in the row's ``outcome``."""

    handler: str
    detail: dict[str, Any] = field(default_factory=dict)


Handler = Callable[[HandlerContext], Handled | None]
