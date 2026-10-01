from http import HTTPStatus

from django.conf import settings
from django.contrib.auth import login
from django.contrib.auth import logout as django_logout
from django.http import HttpRequest
from django.middleware.csrf import get_token
from ninja import Router, Status
from ninja.security import django_auth

from identity.adapters import wiring
from identity.adapters.django_repos import person_data
from identity.domain import InvalidPhoneError, OtpVerificationError, RateLimitedError
from identity.models import Person
from identity.schemas import (
    CsrfOut,
    ErrorOut,
    MeOut,
    OtpRequestIn,
    OtpRequestOut,
    OtpVerifyIn,
    OtpVerifyOut,
)
from identity.use_cases.logout import logout as logout_use_case
from identity.use_cases.me import me as me_use_case
from identity.use_cases.request_otp import request_otp as request_otp_use_case
from identity.use_cases.verify_otp import verify_otp as verify_otp_use_case
from shared.api_errors import ApiError, CsrfCookie

router = Router(tags=["auth"])

AUTHENTICATED_BACKEND = "django.contrib.auth.backends.ModelBackend"


def client_ip(request: HttpRequest) -> str:
    """``CF-Connecting-IP`` when trusted and present, else the socket address.

    The header is only trusted (``TRUST_CF_CONNECTING_IP``, on in prod) because there the api is
    reachable solely through cloudflared, which always sets it. Elsewhere any client could forge it.
    """
    if settings.TRUST_CF_CONNECTING_IP:
        forwarded = request.headers.get("CF-Connecting-IP")
        if forwarded:
            return forwarded
    return request.META.get("REMOTE_ADDR", "")


@router.get("/auth/csrf", response={HTTPStatus.OK: CsrfOut}, auth=None, summary="Csrf")
def csrf(request):
    return Status(HTTPStatus.OK, CsrfOut(csrf_token=get_token(request)))


@router.post(
    "/auth/otp/request",
    response={
        HTTPStatus.ACCEPTED: OtpRequestOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
        HTTPStatus.TOO_MANY_REQUESTS: ErrorOut,
        HTTPStatus.SERVICE_UNAVAILABLE: ErrorOut,
    },
    auth=CsrfCookie(),
    summary="Request Otp",
)
def request_otp(request, payload: OtpRequestIn):
    """Always answers the same 202 for valid phones.

    400 codes: `invalid_phone`, `invalid_request`. 403: `csrf_failed`.
    """
    if not settings.OTP_DELIVERY_ENABLED:
        raise ApiError(
            HTTPStatus.SERVICE_UNAVAILABLE, "delivery_unavailable", "OTP delivery is disabled"
        )
    try:
        result = request_otp_use_case(
            payload.phone,
            client_ip(request),
            wiring.clock(),
            repo=wiring.challenge_repo(),
            eligibility=wiring.crews_gateway(),
            sender=wiring.otp_sender(),
            config=wiring.otp_config(),
        )
    except InvalidPhoneError as exc:
        raise ApiError(HTTPStatus.BAD_REQUEST, "invalid_phone", "Invalid phone number") from exc
    except RateLimitedError as exc:
        raise ApiError(
            HTTPStatus.TOO_MANY_REQUESTS,
            "rate_limited",
            "Too many code requests",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    return Status(
        HTTPStatus.ACCEPTED,
        OtpRequestOut(
            status="sent",
            retry_after_seconds=result.retry_after_seconds,
            expires_in_seconds=result.expires_in_seconds,
        ),
    )


@router.post(
    "/auth/otp/verify",
    response={
        HTTPStatus.OK: OtpVerifyOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
    },
    auth=CsrfCookie(),
    summary="Verify Otp",
)
def verify_otp(request, payload: OtpVerifyIn):
    """Logs the person in.

    400 codes: `invalid_phone`, `invalid_code`, `expired_code`, `too_many_attempts`,
    `invalid_request`. 403: `csrf_failed`.
    """
    try:
        person = verify_otp_use_case(
            payload.phone,
            payload.code,
            wiring.clock(),
            repo=wiring.challenge_repo(),
            persons=wiring.person_provisioner(),
            invites=wiring.crews_gateway(),
            config=wiring.otp_config(),
        )
    except InvalidPhoneError as exc:
        raise ApiError(HTTPStatus.BAD_REQUEST, "invalid_phone", "Invalid phone number") from exc
    except OtpVerificationError as exc:
        raise ApiError(HTTPStatus.BAD_REQUEST, exc.code, "Code verification failed") from exc
    account = Person.objects.get(pk=person.id)
    if not account.is_active:
        raise ApiError(HTTPStatus.BAD_REQUEST, "invalid_code", "Code verification failed")
    # login() cycles the session key and rotates the CSRF token.
    login(request, account, backend=AUTHENTICATED_BACKEND)
    return Status(HTTPStatus.OK, OtpVerifyOut(person=person))


@router.post(
    "/auth/logout",
    response={
        HTTPStatus.NO_CONTENT: None,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.FORBIDDEN: ErrorOut,
    },
    auth=django_auth,
    summary="Logout",
)
def logout(request):
    logout_use_case(lambda: django_logout(request))
    return Status(HTTPStatus.NO_CONTENT, None)


@router.get(
    "/me",
    response={HTTPStatus.OK: MeOut, HTTPStatus.UNAUTHORIZED: ErrorOut},
    auth=django_auth,
    summary="Me",
)
def me(request):
    result = me_use_case(person_data(request.auth), wiring.crews_gateway())
    return Status(HTTPStatus.OK, MeOut(person=result.person, crews=result.crews))
