"""Runs the unfurl off the request path (same pattern as the OTP sender).

``schedule_fetch`` submits ``fetch_preview`` to a small module-level thread pool after the
surrounding transaction commits. ``LINKPREVIEW_FETCH_SYNC`` (tests) runs it inline. Queued
fetches are lost on a worker restart; the ``linkpreview.retry_pending`` tick job picks the row up
again.
"""

import logging
from concurrent.futures import ThreadPoolExecutor

from django.db import close_old_connections, transaction

from linkpreview import conf
from linkpreview.use_cases.fetch_preview import fetch_preview

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="linkpreview")


def _run(preview_id: str) -> None:
    try:
        fetch_preview(preview_id)
    except Exception:  # a fetch problem is a stored status; anything else is only logged
        logger.exception("unfurling preview %s crashed", preview_id)


def _run_in_thread(preview_id: str) -> None:
    try:
        _run(preview_id)
    finally:
        close_old_connections()


def schedule_fetch(preview_id: str) -> None:
    if conf.fetch_sync():
        _run(preview_id)
        return
    transaction.on_commit(lambda: _executor.submit(_run_in_thread, preview_id))


class ExecutorFetchScheduler:
    def schedule(self, preview_id: str) -> None:
        schedule_fetch(preview_id)
