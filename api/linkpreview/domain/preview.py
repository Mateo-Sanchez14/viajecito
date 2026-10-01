"""Preview value objects and the rules that turn parsed page metadata into a ``PreviewData``."""

import re
import unicodedata
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from linkpreview.domain.urls import slug_title

OK, PARTIAL, BLOCKED, FAILED, PENDING = "ok", "partial", "blocked", "failed", "pending"
FETCH_STATUSES = (PENDING, OK, PARTIAL, BLOCKED, FAILED)

TITLE_MAX, DESCRIPTION_MAX, SITE_NAME_MAX, URL_MAX = 300, 1000, 200, 2000
RAW_MAX_CHARS = 30_000  # the model allows 32 KB; leave room for JSON overhead
_CHALLENGE_TITLES = frozenset(
    {
        "just a moment...",
        "attention required! | cloudflare",
        "access denied",
        "robot check",
        "are you a robot?",
        "captcha",
        "verifying you are human",
    }
)


def clean_text(value: object, limit: int) -> str:
    """Strip control and formatting characters (incl. bidi overrides), collapse whitespace, cut."""
    text = "".join(
        " " if ch.isspace() else ch
        for ch in str(value or "")
        if ch.isspace()
        or (unicodedata.category(ch) not in {"Cc", "Cf", "Cs", "Co", "Cn"} and ch != "\ufffd")
    )
    return re.sub(r"\s+", " ", text).strip()[:limit]


@dataclass(frozen=True)
class PageMeta:
    """What the parser extracted from one HTML page (no network, no fetch status yet)."""

    title: str = ""
    description: str = ""
    image_url: str = ""
    site_name: str = ""
    price_amount: Decimal | None = None
    price_currency: str = ""
    lat: float | None = None
    lng: float | None = None
    raw: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class PreviewData:
    """The outcome of unfurling one URL. Failures are values, never exceptions."""

    url: str
    final_url: str = ""
    site_name: str = ""
    title: str = ""
    description: str = ""
    image_url: str = ""
    price_amount: Decimal | None = None
    price_currency: str = ""
    lat: float | None = None
    lng: float | None = None
    fetch_status: str = OK
    fetch_error: str = ""
    thumbnail: bytes | None = None  # WebP, already resized
    raw: dict[str, Any] = field(default_factory=dict)


def blocked_preview(url: str, error: str, *, final_url: str = "") -> PreviewData:
    """A page we may not or cannot read (403/429, non-HTML, SSRF guard): slug title, no meta."""
    return PreviewData(
        url=url,
        final_url=final_url,
        title=clean_text(slug_title(final_url or url), TITLE_MAX),
        fetch_status=BLOCKED,
        fetch_error=error,
    )


def failed_preview(url: str, error: str, *, final_url: str = "") -> PreviewData:
    """A transient failure (network, timeout, 5xx): retried by the tick job."""
    return PreviewData(
        url=url,
        final_url=final_url,
        title=clean_text(slug_title(final_url or url), TITLE_MAX),
        fetch_status=FAILED,
        fetch_error=error,
    )


def finalize(
    url: str, final_url: str, meta: PageMeta, thumbnail: bytes | None = None
) -> PreviewData:
    """Combine parsed metadata into the stored preview: slug fallback, status, truncation."""
    if meta.title.strip().lower() in _CHALLENGE_TITLES:
        return blocked_preview(url, "challenge_page", final_url=final_url)
    has_content = bool(meta.title or meta.image_url)
    return PreviewData(
        url=url,
        final_url=final_url,
        site_name=clean_text(meta.site_name, SITE_NAME_MAX),
        title=clean_text(meta.title, TITLE_MAX)
        or clean_text(slug_title(final_url or url), TITLE_MAX),
        description=clean_text(meta.description, DESCRIPTION_MAX),
        image_url=meta.image_url[:URL_MAX],
        price_amount=meta.price_amount,
        price_currency=meta.price_currency,
        lat=meta.lat,
        lng=meta.lng,
        fetch_status=OK if has_content else PARTIAL,
        thumbnail=thumbnail,
        raw=dict(meta.raw),
    )
