"""``pywebpush`` adapter of the ``PushSender`` port."""

import logging
from urllib.parse import urlsplit

import requests
from pywebpush import WebPushException, webpush

from notifications.ports import SendResult, SubscriptionData

logger = logging.getLogger(__name__)

TTL_SECONDS = 43200  # 12 h: a phone that is off overnight still gets the morning digest
GONE_STATUSES = (404, 410)


class NoRedirectSession(requests.Session):
    """A push service must answer directly: following a redirect would defeat the endpoint
    allowlist (SSRF), so a 3xx is treated as a failed delivery."""

    def get_redirect_target(self, resp):  # noqa: ARG002
        return None


class WebPushSender:
    def __init__(self, *, private_key: str, subject: str, timeout: float) -> None:
        self._private_key = private_key
        self._subject = subject
        self._timeout = timeout

    def send(self, subscription: SubscriptionData, payload: str) -> SendResult:
        host = urlsplit(subscription.endpoint).hostname
        try:
            with NoRedirectSession() as session:
                webpush(
                    subscription_info={
                        "endpoint": subscription.endpoint,
                        "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                    },
                    data=payload,
                    vapid_private_key=self._private_key,
                    vapid_claims={"sub": self._subject},  # webpush() mutates this dict
                    ttl=TTL_SECONDS,
                    timeout=self._timeout,
                    headers={"Urgency": "normal"},
                    requests_session=session,
                )
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in GONE_STATUSES:
                return SendResult("gone")
            logger.warning("push to %s failed with status %s", host, status)
            return SendResult("error")
        except Exception as exc:
            # Never log ``exc`` details that could echo key material; the type is enough.
            logger.warning("push to %s failed: %s", host, type(exc).__name__)
            return SendResult("error")
        return SendResult("ok")
