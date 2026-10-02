"""Integration configuration must guard every new pure layer and cross-app boundary."""

import tomllib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
APPS = ("logistics", "budget", "documents", "itinerary")


def contracts():
    return tomllib.loads((ROOT / "pyproject.toml").read_text())["tool"]["importlinter"]["contracts"]


def test_pure_layers_include_every_wave_b_domain_use_case_and_port():
    contract = next(
        c
        for c in contracts()
        if c["name"] == "domain, use cases and ports import no framework or HTTP code"
    )
    for app in APPS:
        for layer in ("domain", "use_cases", "ports"):
            if (ROOT / app / layer).exists() or (ROOT / app / f"{layer}.py").exists():
                assert f"{app}.{layer}" in contract["source_modules"]


@pytest.mark.parametrize("app", APPS)
def test_wave_b_boundaries_guard_other_apps_and_only_exempt_tests(app):
    contract = next((c for c in contracts() if c["source_modules"] == [app]), None)
    assert contract is not None
    for other in ("identity", "crews", "trips", "proposals", *APPS):
        if other != app:
            for layer in ("models", "domain", "ports", "adapters", "api", "schemas"):
                if (ROOT / other / layer).exists() or (ROOT / other / f"{layer}.py").exists():
                    assert f"{other}.{layer}" in contract["forbidden_modules"]
    assert contract["allow_indirect_imports"] is True
    assert all(rule.startswith(f"{app}.tests.") for rule in contract.get("ignore_imports", []))


def test_messaging_cannot_bypass_wave_b_use_case_seams():
    contract = next(c for c in contracts() if c["source_modules"] == ["messaging"])
    for app in APPS:
        for layer in ("models", "domain", "ports", "adapters", "api", "schemas"):
            if (ROOT / app / layer).exists() or (ROOT / app / f"{layer}.py").exists():
                assert f"{app}.{layer}" in contract["forbidden_modules"]
