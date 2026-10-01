from datetime import UTC, datetime, timedelta

from messaging.ports import GatewayError, QueuedMessage
from messaging.use_cases.dispatch_queued import dispatch_queued
from messaging.use_cases.run_tick import TickConfig, run_tick
from shared.clock import FrozenClock

NOW = datetime(2025, 10, 15, 12, 0, tzinfo=UTC)


class FakeQueue:
    def __init__(self, rows, claimable=True):
        self.rows = rows
        self.claimable = claimable
        self.claimed: list[int] = []
        self.sent: list[int] = []
        self.failed: list[int] = []

    def queued(self, created_before, max_attempts, limit):
        return self.rows

    def claim(self, message_id, now):
        self.claimed.append(message_id)
        return self.claimable

    def mark_sent(self, message_id, gowa_message_id):
        self.sent.append(message_id)

    def mark_failed(self, message_id, error):
        self.failed.append(message_id)

    def sweep_stuck(self, before, max_attempts, now):
        return 0


class FakeGateway:
    def __init__(self, fail=False):
        self.calls: list[str] = []
        self.fail = fail

    def send_text(self, to_jid, body, reply_to=None):
        self.calls.append(body)
        if self.fail:
            raise GatewayError("boom")
        return "WA1"


def row(i=1, kind="reminder"):
    return QueuedMessage(id=i, to_jid="g@g.us", kind=kind, body=f"m{i}", reply_to=None)


def run(queue, gateway, clock=None, deadline=None):
    clock = clock or FrozenClock(NOW)
    return dispatch_queued(
        queue=queue,
        gateway=gateway,
        clock=clock,
        min_age=timedelta(seconds=60),
        max_attempts=3,
        limit=10,
        deadline=deadline or NOW + timedelta(seconds=100),
    )


def test_a_row_another_tick_claimed_is_not_sent():
    queue, gateway = FakeQueue([row()], claimable=False), FakeGateway()
    result = run(queue, gateway)
    assert gateway.calls == [] and (result.sent, result.failed) == (0, 0)


def test_rows_are_claimed_before_sending_and_marked_after():
    queue, gateway = FakeQueue([row(1), row(2)]), FakeGateway()
    result = run(queue, gateway)
    assert queue.claimed == [1, 2] and queue.sent == [1, 2] and result.sent == 2


def test_gateway_failure_marks_the_claimed_row_failed():
    queue = FakeQueue([row()])
    result = run(queue, FakeGateway(fail=True))
    assert queue.failed == [1] and result.failed == 1


def test_nothing_is_dispatched_past_the_deadline():
    queue, gateway = FakeQueue([row(1), row(2)]), FakeGateway()
    result = run(queue, gateway, deadline=NOW)
    assert queue.claimed == [] and gateway.calls == [] and result.sent == 0


def test_redacted_rows_are_failed_without_sending():
    queue, gateway = FakeQueue([row(kind="otp")]), FakeGateway()
    run(queue, gateway)
    assert queue.failed == [1] and gateway.calls == []


def test_tick_hands_dispatch_a_deadline_before_the_lock_expires():
    class Locks:
        def acquire(self, *a):
            return True

        def release(self, *a):
            pass

    class Inbound:
        def sweep_stuck(self, *a):
            return 0, 0

        def received_ids(self, limit):
            return [1]

    class Rosters:
        def crews_needing_sync(self, before):
            return ["c1"]

        def sync_roster(self, crew_id):
            raise AssertionError("roster sync must be skipped when the lock is nearly gone")

    clock = FrozenClock(NOW)
    seen = {}

    def slow_process(inbound_id):
        clock.advance(timedelta(seconds=110))  # a slow pass: only 10 s of the 120 s lock remain
        return "done"

    def dispatch(deadline):
        seen["deadline"] = deadline
        return dispatch_queued(
            queue=FakeQueue([row()]),
            gateway=FakeGateway(),
            clock=clock,
            min_age=timedelta(0),
            max_attempts=3,
            limit=10,
            deadline=deadline,
        )

    summary = run_tick(
        locks=Locks(),
        inbound=Inbound(),
        outbound=FakeQueue([]),
        rosters=Rosters(),
        process=slow_process,
        dispatch=dispatch,
        clock=clock,
        config=TickConfig(stuck_minutes=2, roster_sync_hours=24, lock_seconds=120),
        owner="t",
    )
    assert seen["deadline"] == NOW + timedelta(seconds=105)
    assert summary["dispatched"] == 0 and summary["rosters_synced"] == 0
