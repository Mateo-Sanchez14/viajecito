"""Dev-only stand-in for Gowa's ``POST /send/message`` and ``GET /group/participants``.

Records every accepted send in memory so tests and developers can assert on what the
backend "sent" via ``GET /__sent`` without a real WhatsApp session. Group rosters are seeded
with ``PUT /__groups/{group_id}`` and served the way Gowa serves them.
"""

import os
import secrets
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field

app = FastAPI(title="fake-gowa")
basic_auth = HTTPBasic(auto_error=False)

SENT: list[dict] = []
GROUPS: dict[str, list[dict]] = {}


class SendMessage(BaseModel):
    phone: str = Field(min_length=1)
    message: str = Field(min_length=1)
    reply_message_id: str | None = None


class Participant(BaseModel):
    """A group member as Gowa lists it; unknown extra fields are kept."""

    model_config = {"extra": "allow"}

    jid: str = Field(min_length=1)
    phone_number: str | None = None
    lid: str | None = None
    display_name: str = ""
    is_admin: bool = False
    is_super_admin: bool = False


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    details = "; ".join(
        f"{'.'.join(str(p) for p in err['loc'] if p != 'body')}: {err['msg']}" for err in exc.errors()
    )
    return JSONResponse(
        status_code=400, content={"code": "VALIDATION_ERROR", "message": details or "Invalid request"}
    )


def require_auth(credentials: Annotated[HTTPBasicCredentials | None, Depends(basic_auth)]) -> None:
    expected = os.environ.get("APP_BASIC_AUTH")
    if not expected:
        return
    user, _, password = expected.partition(":")
    ok = (
        credentials is not None
        and secrets.compare_digest(credentials.username, user)
        and secrets.compare_digest(credentials.password, password)
    )
    if not ok:
        raise HTTPException(
            status_code=401, detail="Unauthorized", headers={"WWW-Authenticate": "Basic"}
        )


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/send/message", dependencies=[Depends(require_auth)])
def send_message(body: SendMessage) -> dict:
    message_id = str(uuid.uuid4())
    SENT.append(
        {
            "id": message_id,
            "phone": body.phone,
            "message": body.message,
            "reply_message_id": body.reply_message_id,
            "received_at": datetime.now(UTC).isoformat(),
        }
    )
    return {
        "code": "SUCCESS",
        "message": "Message sent",
        "results": {"message_id": message_id, "status": f"Message sent to {body.phone}"},
    }


@app.get("/__sent")
def list_sent(phone: str | None = None) -> list[dict]:
    return [r for r in SENT if phone is None or r["phone"] == phone]


def _digits(phone: str) -> str:
    """Normalize a phone to bare digits: strip a ``+`` prefix and the WhatsApp JID suffix."""
    return phone.split("@", 1)[0].lstrip("+")


@app.get("/__sent/latest")
def latest_sent(phone: str | None = None):
    if not phone:
        return JSONResponse(
            status_code=400, content={"code": "VALIDATION_ERROR", "message": "phone is required"}
        )
    wanted = _digits(phone)
    for record in reversed(SENT):
        if _digits(record["phone"]) == wanted:
            return record
    return JSONResponse(
        status_code=404, content={"code": "NOT_FOUND", "message": f"No message sent to {phone}"}
    )


@app.delete("/__sent")
def clear_sent() -> dict:
    SENT.clear()
    return {"status": "cleared"}


@app.get("/group/participants", dependencies=[Depends(require_auth)])
def group_participants(group_id: str) -> dict:
    return {
        "code": "SUCCESS",
        "message": "Success get list participants",
        "results": {"participants": GROUPS.get(group_id, [])},
    }


@app.put("/__groups/{group_id}")
def seed_group(group_id: str, participants: list[Participant]) -> dict:
    GROUPS[group_id] = [p.model_dump() for p in participants]
    return {"status": "seeded", "group_id": group_id, "participants": len(participants)}


@app.get("/__groups")
def list_groups() -> dict[str, list[dict]]:
    return GROUPS


@app.delete("/__groups")
def clear_groups() -> dict:
    GROUPS.clear()
    return {"status": "cleared"}
