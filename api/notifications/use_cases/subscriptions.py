from collections.abc import Iterable

from notifications.domain.subscriptions import RateLimitedError, validate_subscription
from notifications.ports import DeliveryLedger, SubscriptionData, SubscriptionStore
from shared.clock import Clock

MAX_NEW_SUBSCRIPTIONS_PER_HOUR = 10
MAX_SUBSCRIPTIONS_PER_PERSON = 5  # a person has a few browsers; the oldest are evicted


def register_subscription(
    person_id: str,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str,
    *,
    store: SubscriptionStore,
    ledger: DeliveryLedger,
    allowed_hosts: Iterable[str],
    clock: Clock,
) -> tuple[SubscriptionData, bool]:
    """Register (or refresh) a browser subscription for the person; ``True`` when a new row.

    An endpoint registered to someone else is re-assigned (same browser, new login). Taking over
    or adding endpoints is limited per person; refreshing one of their own never is.
    """
    valid = validate_subscription(endpoint, p256dh, auth, user_agent, allowed_hosts)
    existing = store.get_by_endpoint(valid.endpoint)
    if existing is None or existing.person_id != person_id:
        _take_registration_slot(person_id, ledger, clock)
    row, created = store.upsert(person_id, valid)
    store.trim(person_id, MAX_SUBSCRIPTIONS_PER_PERSON, row.id)
    return row, created


def _take_registration_slot(person_id: str, ledger: DeliveryLedger, clock: Clock) -> None:
    """At most ``MAX_NEW_SUBSCRIPTIONS_PER_HOUR`` takeovers or additions per person per clock hour.

    The count lives in the delivery ledger (keys ``register:<hour>:<n>``) so that evicting old
    subscriptions never resets it. The window is the calendar hour, not a sliding hour: it is an
    approximate abuse guard (a person can do up to twice the limit around an hour boundary)."""
    now = clock.now()
    hour = now.strftime("%Y%m%d%H")
    for slot in range(MAX_NEW_SUBSCRIPTIONS_PER_HOUR):
        if ledger.reserve(f"register:{hour}:{slot}", person_id):
            ledger.finish(f"register:{hour}:{slot}", person_id, "skipped", 0)
            return
    retry = 3600 - (now.minute * 60 + now.second)
    raise RateLimitedError(retry)


def unregister_subscription(person_id: str, endpoint: str, *, store: SubscriptionStore) -> None:
    store.delete_endpoint(person_id, endpoint)


def list_subscriptions(person_id: str, *, store: SubscriptionStore) -> list[SubscriptionData]:
    return store.list_for_person(person_id)
