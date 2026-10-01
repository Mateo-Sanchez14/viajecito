"""``POST /hooks/gowa/``: signature check, then idempotent ingestion. No network I/O in here."""

import json

from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from messaging.adapters import wiring
from messaging.gowa.signature import verify_signature
from messaging.use_cases.ingest_inbound import ingest_inbound
from messaging.waha import parser as waha_parser
from messaging.waha import signature as waha_signature

SIGNATURE_HEADER = "X-Hub-Signature-256"


@csrf_exempt
@require_POST
def gowa_webhook(request: HttpRequest) -> JsonResponse:
    raw_body = request.body
    if not verify_signature(
        raw_body, request.headers.get(SIGNATURE_HEADER), settings.GOWA_WEBHOOK_SECRET
    ):
        return JsonResponse({"code": "invalid_signature"}, status=403)
    try:
        payload = json.loads(raw_body)
    except ValueError:
        payload = None
    if not isinstance(payload, dict):
        return JsonResponse({"code": "invalid_payload"}, status=400)
    return _ingest(payload)


def _ingest(payload: dict, parse=None) -> JsonResponse:
    kwargs = {"parse": parse} if parse else {}
    result = ingest_inbound(
        payload,
        store=wiring.inbound_store(),
        links=wiring.crews_gateway(),
        scheduler=wiring.process_scheduler(),
        **kwargs,
    )
    return JsonResponse(result.body())


@csrf_exempt
@require_POST
def waha_webhook(request: HttpRequest) -> JsonResponse:
    """WAHA delivers ``X-Webhook-Hmac`` (hex HMAC-SHA512 of the raw body); fails closed."""
    raw_body = request.body
    algorithm = request.headers.get(waha_signature.ALGORITHM_HEADER)
    if (
        algorithm is not None and algorithm.strip().lower() != waha_signature.ALGORITHM
    ) or not waha_signature.verify_signature(
        raw_body, request.headers.get(waha_signature.HEADER), settings.WAHA_WEBHOOK_HMAC_KEY
    ):
        return JsonResponse({"code": "invalid_signature"}, status=403)
    try:
        payload = json.loads(raw_body)
    except ValueError:
        payload = None
    if not isinstance(payload, dict):
        return JsonResponse({"code": "invalid_payload"}, status=400)
    return _ingest(payload, waha_parser.parse_message_event)
