"""Canned previews by host (``LINKPREVIEW_FETCHER=static``) for the dev stack and e2e: no network.

The table lives in ``linkpreview/tests/fixtures/static_previews.json``; a ``color`` entry gets a
solid-colour WebP thumbnail so the web shows an image without fetching one.
"""

import io
import json
from decimal import Decimal
from pathlib import Path

from PIL import Image

from linkpreview.domain.preview import PageMeta, PreviewData, finalize
from linkpreview.domain.urls import host_of

TABLE = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "static_previews.json"


def _thumbnail(color: str) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (640, 360), color).save(out, "WEBP", quality=70)
    return out.getvalue()


class StaticLinkPreviewFetcher:
    def __init__(self, table_path: Path = TABLE) -> None:
        self._table = json.loads(table_path.read_text(encoding="utf-8"))

    def unfurl(self, url: str) -> PreviewData:
        entry = self._table.get(host_of(url))
        if entry is None:  # unknown host: behaves like a page without metadata
            return finalize(url, url, PageMeta())
        price = entry.get("price_amount")
        meta = PageMeta(
            title=entry.get("title", ""),
            description=entry.get("description", ""),
            site_name=entry.get("site_name", host_of(url)),
            price_amount=Decimal(price) if price is not None else None,
            price_currency=entry.get("price_currency", ""),
            lat=entry.get("lat"),
            lng=entry.get("lng"),
        )
        thumbnail = _thumbnail(entry["color"]) if entry.get("color") else None
        return finalize(url, url, meta, thumbnail)
