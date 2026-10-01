from collections.abc import Iterable
from importlib import import_module
from importlib.util import find_spec

from django.conf import settings
from ninja import NinjaAPI

from config.version import VERSION
from shared.api_errors import register_error_handlers


def mount_app_routers(api: NinjaAPI, apps: Iterable[str]) -> None:
    """Mount ``<app>.api.router`` at ``<app>.api.PREFIX`` (default ``""``) for every app.

    Apps without an ``api`` module or without a ``router`` are skipped. An ``api`` module that
    exists but fails to import raises, so a typo never silently drops an app's endpoints.
    """
    for app in apps:
        if find_spec(f"{app}.api") is None:
            continue
        module = import_module(f"{app}.api")
        router = getattr(module, "router", None)
        if router is not None:
            api.add_router(getattr(module, "PREFIX", ""), router)


api = NinjaAPI(title="viajecito", version=VERSION, urls_namespace="api")
register_error_handlers(api)
mount_app_routers(api, settings.PROJECT_APPS)
