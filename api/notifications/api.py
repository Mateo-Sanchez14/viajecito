from http import HTTPStatus
from urllib.parse import urlsplit

from ninja import Router, Status
from ninja.security import django_auth

from crews.api_auth import current_person
from notifications import conf
from notifications.adapters.django_store import (
    DjangoPreferenceStore,
    DjangoSubscriptionStore,
)
from notifications.domain.preferences import InvalidPreferencesError
from notifications.domain.subscriptions import InvalidSubscriptionError, RateLimitedError
from notifications.ports import SubscriptionData
from notifications.schemas import (
    PreferencesIn,
    PreferencesOut,
    SubscriptionIn,
    SubscriptionOut,
    UnsubscribeIn,
    VapidKeyOut,
)
from notifications.use_cases.preferences import get_preferences, set_preferences
from notifications.use_cases.subscriptions import (
    list_subscriptions,
    register_subscription,
    unregister_subscription,
)
from shared.api_errors import ApiError, ErrorOut
from shared.clock import SystemClock

PREFIX = "/notifications"
router = Router(tags=["notifications"])

COMMON_ERRORS = {HTTPStatus.UNAUTHORIZED: ErrorOut, HTTPStatus.FORBIDDEN: ErrorOut}


def subscription_out(row: SubscriptionData) -> SubscriptionOut:
    return SubscriptionOut(
        id=row.id, endpoint_host=urlsplit(row.endpoint).hostname or "", created_at=row.created_at
    )


def require_push() -> None:
    if not conf.push_enabled():
        raise ApiError(HTTPStatus.SERVICE_UNAVAILABLE, "push_unavailable", "Push is not configured")


def rate_limited(exc: RateLimitedError) -> ApiError:
    return ApiError(
        HTTPStatus.TOO_MANY_REQUESTS,
        "rate_limited",
        "Too many requests",
        headers={"Retry-After": str(exc.retry_after_seconds)},
    )


@router.get(
    "/vapid_public_key",
    response={
        HTTPStatus.OK: VapidKeyOut,
        HTTPStatus.UNAUTHORIZED: ErrorOut,
        HTTPStatus.SERVICE_UNAVAILABLE: ErrorOut,
    },
    auth=django_auth,
    summary="Get Vapid Public Key",
)
def vapid_public_key(request):
    """503 `push_unavailable` when the VAPID keys are not configured."""
    current_person(request)
    require_push()
    return Status(HTTPStatus.OK, VapidKeyOut(public_key=conf.vapid_public_key()))


@router.post(
    "/subscriptions",
    response={
        HTTPStatus.CREATED: SubscriptionOut,
        HTTPStatus.OK: SubscriptionOut,
        HTTPStatus.BAD_REQUEST: ErrorOut,
        HTTPStatus.TOO_MANY_REQUESTS: ErrorOut,
        **COMMON_ERRORS,
    },
    auth=django_auth,
    summary="Register Push Subscription",
)
def register(request, payload: SubscriptionIn):
    """201 when new, 200 when the endpoint already was mine or is re-assigned to me.
    400 codes: `invalid_subscription`. 429: `rate_limited` (more than 10 new per hour)."""
    person = current_person(request)
    try:
        row, created = register_subscription(
            str(person.pk),
            payload.endpoint,
            payload.keys.p256dh,
            payload.keys.auth,
            payload.user_agent or request.META.get("HTTP_USER_AGENT", ""),
            store=DjangoSubscriptionStore(),
            allowed_hosts=conf.endpoint_hosts(),
            clock=SystemClock(),
        )
    except InvalidSubscriptionError as exc:
        raise ApiError(HTTPStatus.BAD_REQUEST, "invalid_subscription", str(exc)) from exc
    except RateLimitedError as exc:
        raise rate_limited(exc) from exc
    return Status(HTTPStatus.CREATED if created else HTTPStatus.OK, subscription_out(row))


@router.delete(
    "/subscriptions",
    response={HTTPStatus.NO_CONTENT: None, **COMMON_ERRORS},
    auth=django_auth,
    summary="Unregister Push Subscription",
)
def unregister(request, payload: UnsubscribeIn):
    """Idempotent; only the caller's own rows are ever removed."""
    person = current_person(request)
    unregister_subscription(str(person.pk), payload.endpoint, store=DjangoSubscriptionStore())
    return Status(HTTPStatus.NO_CONTENT, None)


@router.get(
    "/subscriptions",
    response={HTTPStatus.OK: list[SubscriptionOut], HTTPStatus.UNAUTHORIZED: ErrorOut},
    auth=django_auth,
    summary="List Push Subscriptions",
)
def list_mine(request):
    person = current_person(request)
    rows = list_subscriptions(str(person.pk), store=DjangoSubscriptionStore())
    return Status(HTTPStatus.OK, [subscription_out(row) for row in rows])


@router.get(
    "/preferences",
    response={HTTPStatus.OK: PreferencesOut, HTTPStatus.UNAUTHORIZED: ErrorOut},
    auth=django_auth,
    summary="Get Notification Preferences",
)
def get_prefs(request):
    person = current_person(request)
    prefs = get_preferences(str(person.pk), store=DjangoPreferenceStore())
    return Status(HTTPStatus.OK, PreferencesOut(push=prefs))


@router.put(
    "/preferences",
    response={HTTPStatus.OK: PreferencesOut, HTTPStatus.BAD_REQUEST: ErrorOut, **COMMON_ERRORS},
    auth=django_auth,
    summary="Set Notification Preferences",
)
def put_prefs(request, payload: PreferencesIn):
    """Partial updates are fine; unknown categories are `400 invalid_request`."""
    person = current_person(request)
    try:
        prefs = set_preferences(str(person.pk), payload.push, store=DjangoPreferenceStore())
    except InvalidPreferencesError as exc:
        raise ApiError(HTTPStatus.BAD_REQUEST, "invalid_request", str(exc)) from exc
    return Status(HTTPStatus.OK, PreferencesOut(push=prefs))
