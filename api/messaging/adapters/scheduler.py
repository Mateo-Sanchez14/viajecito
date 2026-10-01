"""Runs inbound processing off the request path.

The webhook answers Gowa immediately; ``process_inbound`` runs on a small thread pool after the
transaction commits (like the OTP sender). ``MESSAGING_PROCESS_SYNC`` runs it inline (tests).
"""

import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from django.db import close_old_connections, transaction

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="inbound")


class ExecutorProcessScheduler:
    def __init__(self, run: Callable[[int], None], *, synchronous: bool) -> None:
        self._run = run
        self._synchronous = synchronous

    def schedule(self, inbound_id: int) -> None:
        if self._synchronous:
            self._safe_run(inbound_id)
            return
        transaction.on_commit(lambda: _executor.submit(self._run_in_thread, inbound_id))

    def _safe_run(self, inbound_id: int) -> None:
        try:
            self._run(inbound_id)
        except Exception:  # processing problems are recorded on the row, never raised
            logger.exception("inbound %s processing crashed", inbound_id)

    def _run_in_thread(self, inbound_id: int) -> None:
        try:
            self._safe_run(inbound_id)
        finally:
            close_old_connections()
