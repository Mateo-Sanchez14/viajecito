"""Production code may only import distributions installed by [project].dependencies.

The prod image installs with `uv sync --no-dev`, so a module that is available locally
only through the dev group crashes the container at startup.
"""

import ast
import re
import sys
import tomllib
from importlib.metadata import PackageNotFoundError, packages_distributions, requires
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent.parent


def _normalize(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def _requirement_name(requirement):
    return _normalize(re.split(r"[<>=!~;\[ (]", requirement, maxsplit=1)[0])


def _installed_by_runtime_sync():
    """Declared runtime deps plus everything they pull in (what `uv sync --no-dev` installs)."""
    project = tomllib.loads((API_ROOT / "pyproject.toml").read_text())["project"]
    pending = [_requirement_name(dep) for dep in project["dependencies"]]
    seen = set()
    while pending:
        name = pending.pop()
        if name in seen:
            continue
        seen.add(name)
        try:
            child_requirements = requires(name) or []
        except PackageNotFoundError:
            continue
        pending.extend(_requirement_name(r) for r in child_requirements if "extra ==" not in r)
    return seen


def _first_party_modules():
    return {
        path.name
        for path in API_ROOT.iterdir()
        if path.is_dir() and (path / "__init__.py").exists()
    }


def _is_production_file(path):
    parts = path.relative_to(API_ROOT).parts
    return not any(
        part in {"tests", "conftest.py", ".venv"} or part.startswith("test_") for part in parts
    )


def _imported_top_level_modules(path):
    tree = ast.parse(path.read_text(), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield alias.name.split(".")[0]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            yield node.module.split(".")[0]


def test_production_imports_are_declared_runtime_dependencies():
    declared = _installed_by_runtime_sync()
    first_party = _first_party_modules()
    module_to_distributions = packages_distributions()
    missing = {}
    for path in sorted(API_ROOT.rglob("*.py")):
        if not _is_production_file(path):
            continue
        for module in _imported_top_level_modules(path):
            if module in sys.stdlib_module_names or module in first_party or module == "__future__":
                continue
            distributions = {_normalize(d) for d in module_to_distributions.get(module, [module])}
            if not distributions & declared:
                missing.setdefault(module, str(path.relative_to(API_ROOT)))
    assert missing == {}, (
        f"imported by production code, not installed by [project].dependencies: {missing}"
    )
