"""Composition root of linkpreview: which fetcher runs is a setting (``LINKPREVIEW_FETCHER``)."""

from linkpreview import conf
from linkpreview.adapters.django_store import DjangoPreviewStore
from linkpreview.adapters.executor import ExecutorFetchScheduler
from linkpreview.adapters.fake_fetcher import FakeFetcher
from linkpreview.adapters.httpx_fetcher import HttpxLinkPreviewFetcher
from linkpreview.adapters.static_fetcher import StaticLinkPreviewFetcher
from linkpreview.ports import LinkPreviewFetcher


def build_fetcher() -> LinkPreviewFetcher:
    name = conf.fetcher_name()
    if name == "fake":
        return FakeFetcher()
    if name == "static":
        return StaticLinkPreviewFetcher()
    return HttpxLinkPreviewFetcher()


def build_store() -> DjangoPreviewStore:
    return DjangoPreviewStore()


def build_scheduler() -> ExecutorFetchScheduler:
    return ExecutorFetchScheduler()
