from http import HTTPStatus

from ninja import Router, Status

from config.version import VERSION
from ops import checks
from ops.schemas import HealthChecks, HealthOut

router = Router()


@router.get(
    "/health",
    response={HTTPStatus.OK: HealthOut, HTTPStatus.SERVICE_UNAVAILABLE: HealthOut},
    auth=None,
    summary="Health",
)
def health(request):
    results = HealthChecks(db=checks.check_db(), media=checks.check_media())
    healthy = results.db == "ok" and results.media == "ok"
    body = HealthOut(status="ok" if healthy else "degraded", version=VERSION, checks=results)
    return Status(HTTPStatus.OK if healthy else HTTPStatus.SERVICE_UNAVAILABLE, body)
