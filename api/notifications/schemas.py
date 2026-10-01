from datetime import datetime
from uuid import UUID

from ninja import Field, Schema
from pydantic import StrictBool


class SubscriptionKeysIn(Schema):
    p256dh: str = Field(max_length=400)
    auth: str = Field(max_length=400)


class SubscriptionIn(Schema):
    endpoint: str = Field(max_length=2000)
    keys: SubscriptionKeysIn
    user_agent: str = Field("", max_length=1000)


class UnsubscribeIn(Schema):
    endpoint: str = Field(max_length=2000)


class SubscriptionOut(Schema):
    id: UUID
    endpoint_host: str
    created_at: datetime


class VapidKeyOut(Schema):
    public_key: str


class PreferencesIn(Schema):
    push: dict[str, StrictBool]


class PreferencesOut(Schema):
    push: dict[str, bool]


class TestPushOut(Schema):
    sent: int
