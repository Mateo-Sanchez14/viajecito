from collections.abc import Iterable
from datetime import timedelta

from notifications.domain.subscriptions import RateLimitedError, validate_subscription
from notifications.ports import SubscriptionData, SubscriptionStore
from shared.clock import Clock

MAX_NEW_SUBSCRIPTIONS_PER_HOUR = 10
WINDOW = timedelta(hours=1)


def register_subscription(
    person_id: str,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str,
    *,
    store: SubscriptionStore,
    allowed_hosts: Iterable[str],
    clock: Clock,
) -> tuple[SubscriptionData, bool]:
    """Register (or refresh) a browser subscription for the person; ``True`` when a new row.

    An endpoint registered to someone else is re-assigned (same browser, new login). Taking over
    or adding endpoints is limited per person; refreshing one of their own never is.
    """
    valid = validate_subscription(endpoint, p256dh, auth, user_agent, allowed_hosts)
    existing = store.get_by_endpoint(valid.endpoint)
    owned = existing is not None and existing.person_id == person_id
    if not owned:
        recent = store.touched_since(person_id, clock.now() - WINDOW, valid.endpoint)
        if recent >= MAX_NEW_SUBSCRIPTIONS_PER_HOUR:
            raise RateLimitedError(int(WINDOW.total_seconds()))
    return store.upsert(person_id, valid)


def unregister_subscription(person_id: str, endpoint: str, *, store: SubscriptionStore) -> None:
    store.delete_endpoint(person_id, endpoint)


def list_subscriptions(person_id: str, *, store: SubscriptionStore) -> list[SubscriptionData]:
    return store.list_for_person(person_id)
