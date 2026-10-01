import importlib
import textwrap

import pytest
from ninja import NinjaAPI
from ninja.testing import TestClient

from config.api import api as real_api
from config.api import mount_app_routers


@pytest.fixture
def make_app(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(tmp_path))

    def build(name, api_source=None):
        package = tmp_path / name
        package.mkdir()
        (package / "__init__.py").write_text("")
        if api_source is not None:
            (package / "api.py").write_text(textwrap.dedent(api_source))
        importlib.invalidate_caches()
        return name

    return build


def test_an_app_router_is_mounted_at_its_prefix(make_app):
    name = make_app(
        "disc_prefixed",
        """
        from ninja import Router

        PREFIX = "/fake"
        router = Router()

        @router.get("/ping", auth=None)
        def ping(request):
            return {"pong": True}
        """,
    )
    api = NinjaAPI(urls_namespace="disc-prefixed")
    mount_app_routers(api, [name])
    response = TestClient(api).get("/fake/ping")
    assert response.status_code == 200 and response.json() == {"pong": True}


def test_prefix_defaults_to_empty(make_app):
    name = make_app(
        "disc_plain",
        """
        from ninja import Router

        router = Router()

        @router.get("/plain", auth=None)
        def plain(request):
            return {"ok": True}
        """,
    )
    api = NinjaAPI(urls_namespace="disc-plain")
    mount_app_routers(api, [name])
    assert TestClient(api).get("/plain").status_code == 200


def test_apps_without_an_api_module_are_skipped(make_app):
    skipped = make_app("disc_no_api")
    mounted = make_app(
        "disc_mounted",
        """
        from ninja import Router

        router = Router()

        @router.get("/mounted", auth=None)
        def mounted(request):
            return {}
        """,
    )
    api = NinjaAPI(urls_namespace="disc-none")
    mount_app_routers(api, [skipped, mounted])
    client = TestClient(api)
    assert client.get("/mounted").status_code == 200
    assert len(api._routers) == 2  # the default router plus the one app that has an api module


def test_an_api_module_without_a_router_is_skipped(make_app):
    name = make_app("disc_no_router", "VALUE = 1\n")
    mount_app_routers(NinjaAPI(urls_namespace="disc-norouter"), [name])


def test_a_broken_api_module_is_not_swallowed(make_app):
    name = make_app("disc_broken", "import module_that_does_not_exist\n")
    with pytest.raises(ModuleNotFoundError, match="module_that_does_not_exist"):
        mount_app_routers(NinjaAPI(urls_namespace="disc-broken"), [name])


def test_the_real_api_mounts_every_project_app_router():
    paths = {path for path in real_api.get_openapi_schema()["paths"]}
    assert {"/api/health", "/api/me", "/api/auth/logout"} <= paths
