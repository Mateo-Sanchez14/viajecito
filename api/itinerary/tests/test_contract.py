import ast
from pathlib import Path

from config.api import api
from itinerary.schemas import DayOut, NoteOut
from shared.schemas import PersonRefOut


def test_day_path_matches_frozen_contract():
    assert "/api/trips/{trip_id}/itinerary/days/{date}" in api.get_openapi_schema()["paths"]


def test_shared_person_ref_and_nullable_tray():
    assert NoteOut.model_fields["author"].annotation is PersonRefOut
    assert type(None) in DayOut.model_fields["date"].annotation.__args__


def test_pure_modules_have_no_framework_or_http_imports():
    root = Path(__file__).parents[1]
    for directory in ("domain", "use_cases"):
        for path in (root / directory).glob("*.py"):
            for node in ast.walk(ast.parse(path.read_text())):
                names = []
                if isinstance(node, ast.Import):
                    names = [name.name for name in node.names]
                if isinstance(node, ast.ImportFrom):
                    names = [node.module or ""]
                assert not any(
                    name.split(".")[0] in {"django", "ninja", "httpx", "requests"} for name in names
                ), path


def test_cross_app_reads_only_published_use_cases():
    root = Path(__file__).parents[1]
    for path in root.rglob("*.py"):
        if "tests" in path.parts or "migrations" in path.parts:
            continue
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if module.split(".")[0] in {"documents", "logistics", "budget", "ski"}:
                    raise AssertionError(f"Forbidden parallel app import: {path}: {module}")
                if module.split(".")[0] in {"proposals", "identity", "trips", "crews"}:
                    assert ".use_cases." in module or module in {
                        "trips.api_auth",
                        "crews.api_auth",
                    }, (path, module)
