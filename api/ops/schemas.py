from typing import Literal

from ninja import Schema


class HealthChecks(Schema):
    db: Literal["ok", "error"]
    media: Literal["ok", "error"]


class HealthOut(Schema):
    status: Literal["ok", "degraded"]
    version: str
    checks: HealthChecks
