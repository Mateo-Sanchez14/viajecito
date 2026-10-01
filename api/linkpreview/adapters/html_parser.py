"""HTML metadata extraction with selectolax: Open Graph, Twitter cards, price meta, JSON-LD."""

import json
import re
from collections.abc import Iterator
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urljoin

from selectolax.lexbor import LexborHTMLParser

from linkpreview.domain.preview import (
    DESCRIPTION_MAX,
    RAW_MAX_CHARS,
    SITE_NAME_MAX,
    TITLE_MAX,
    URL_MAX,
    PageMeta,
    clean_text,
)
from linkpreview.domain.urls import host_of, parse_maps_coordinates

MAX_JSON_LD_CHARS = 200_000
_RAW_PREFIXES = ("og:", "twitter:", "product:", "place:", "description")
_PRICE_KEYS = ("price", "lowPrice")
_MAX_PRICE = Decimal("9999999999.99")


def _meta_map(tree: LexborHTMLParser) -> dict[str, str]:
    """First ``content`` per ``property``/``name`` (lowercase key)."""
    found: dict[str, str] = {}
    for node in tree.css("meta"):
        attrs = node.attributes
        key = (attrs.get("property") or attrs.get("name") or "").strip().lower()
        content = attrs.get("content")
        if key and content and key not in found:
            found[key] = content
    return found


def _first(meta: dict[str, str], *keys: str) -> str:
    return next((meta[key] for key in keys if meta.get(key, "").strip()), "")


def _decimal(value: object) -> Decimal | None:
    try:
        amount = Decimal(str(value).strip().replace(",", ""))
    except (InvalidOperation, ValueError):
        return None
    if not amount.is_finite() or amount < 0 or amount > _MAX_PRICE:
        return None
    return amount.quantize(Decimal("0.01"))


def _currency(value: object) -> str:
    code = str(value or "").strip().upper()
    return code if re.fullmatch(r"[A-Z]{3}", code) else ""


def _float(value: object) -> float | None:
    try:
        number = float(str(value).strip())
    except ValueError:
        return None
    return number if number == number and abs(number) <= 180 else None  # NaN and range guard


def _coordinates(lat: object, lng: object) -> tuple[float, float] | None:
    la, ln = _float(lat), _float(lng)
    if la is None or ln is None or not (-90 <= la <= 90):
        return None
    return la, ln


def _walk(node: Any) -> Iterator[dict[str, Any]]:
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, list):
        for item in node:
            yield from _walk(item)


def _json_ld(tree: LexborHTMLParser) -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    for node in tree.css('script[type="application/ld+json"]'):
        text = node.text()
        if not text or len(text) > MAX_JSON_LD_CHARS:
            continue
        try:
            objects.extend(_walk(json.loads(text)))
        except ValueError:
            continue
    return objects


def _json_ld_price(objects: list[dict[str, Any]]) -> tuple[Decimal, str] | None:
    for obj in objects:
        currency = _currency(obj.get("priceCurrency"))
        if not currency:
            continue
        for key in _PRICE_KEYS:
            amount = _decimal(obj[key]) if key in obj else None
            if amount is not None:
                return amount, currency
    return None


def _json_ld_geo(objects: list[dict[str, Any]]) -> tuple[float, float] | None:
    for obj in objects:
        geo = obj.get("geo")
        if isinstance(geo, dict):
            found = _coordinates(geo.get("latitude"), geo.get("longitude"))
            if found:
                return found
    return None


def _raw(meta: dict[str, str]) -> dict[str, str]:
    raw: dict[str, str] = {}
    for key, value in meta.items():
        if not key.startswith(_RAW_PREFIXES):
            continue
        raw[key] = clean_text(value, 500)
        if len(json.dumps(raw, ensure_ascii=False)) > RAW_MAX_CHARS:
            del raw[key]
            break
    return raw


def parse_page(html: bytes | str, page_url: str) -> PageMeta:
    """Extract the preview metadata of an HTML page. Never raises on malformed input."""
    tree = LexborHTMLParser(html)
    meta = _meta_map(tree)
    title_node = tree.css_first("title")
    title = _first(meta, "og:title", "twitter:title") or (title_node.text() if title_node else "")
    image = _first(meta, "og:image", "og:image:secure_url", "twitter:image", "twitter:image:src")
    objects = _json_ld(tree)

    price = None
    amount = _decimal(_first(meta, "product:price:amount", "og:price:amount"))
    if amount is not None:
        price = (amount, _currency(_first(meta, "product:price:currency", "og:price:currency")))
    if price is None or not price[1]:
        price = _json_ld_price(objects) or (price if price and price[1] else None)

    coords = (
        _coordinates(
            _first(meta, "place:location:latitude", "og:latitude"),
            _first(meta, "place:location:longitude", "og:longitude"),
        )
        or _json_ld_geo(objects)
        or parse_maps_coordinates(page_url)
    )
    return PageMeta(
        title=clean_text(title, TITLE_MAX),
        description=clean_text(
            _first(meta, "og:description", "twitter:description", "description"), DESCRIPTION_MAX
        ),
        image_url=urljoin(page_url, image.strip())[:URL_MAX] if image.strip() else "",
        site_name=clean_text(_first(meta, "og:site_name") or host_of(page_url), SITE_NAME_MAX),
        price_amount=price[0] if price else None,
        price_currency=price[1] if price else "",
        lat=coords[0] if coords else None,
        lng=coords[1] if coords else None,
        raw=_raw(meta),
    )
