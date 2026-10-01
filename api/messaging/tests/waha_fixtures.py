"""Helpers to load the doc-derived WAHA webhook fixtures."""

import json
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures" / "waha"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())
