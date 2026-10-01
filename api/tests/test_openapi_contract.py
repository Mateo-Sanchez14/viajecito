from pathlib import Path

from django.conf import settings
from django.core.management import call_command

CONTRACT = Path(settings.REPO_DIR) / "contracts" / "openapi.json"


def test_committed_contract_matches_the_exported_schema(tmp_path):
    out = tmp_path / "openapi.json"
    call_command("export_openapi_schema", api="config.api.api", output=str(out), indent=2)
    assert out.read_text() == CONTRACT.read_text(), (
        "contracts/openapi.json is stale; regenerate it (see api/README.md)"
    )


def test_post_routes_document_csrf_failures():
    import json

    paths = json.loads(CONTRACT.read_text())["paths"]
    for path in ("/api/auth/otp/request", "/api/auth/otp/verify", "/api/auth/logout"):
        assert "403" in paths[path]["post"]["responses"], path
