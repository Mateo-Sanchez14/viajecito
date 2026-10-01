"""URL extraction, tracking-parameter stripping and canonicalization (pure; no Django, no HTTP)."""

import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from urllib.parse import unquote, urlsplit, urlunsplit

MAX_URLS = 3
IGNORED_HOSTS = frozenset({"wa.me", "chat.whatsapp.com", "api.whatsapp.com"})

_URL = re.compile(r"(?:https?://|www\.)[^\s<>]+", re.IGNORECASE)
_TRAILING = ".,;:!?…'\"»”’›"
_CLOSERS = {")": "(", "]": "[", "}": "{"}


@dataclass(frozen=True)
class Extraction:
    urls: list[str]  # at most ``MAX_URLS`` non-ignored URLs, in order of appearance
    ignored: int  # URLs skipped because their host is not a proposal source
    overflow: int  # non-ignored URLs beyond the cap


def _trim(raw: str) -> str:
    """Drop trailing punctuation and unbalanced closing brackets."""
    url = raw
    while url:
        last = url[-1]
        if last in _TRAILING:
            url = url[:-1]
        elif last in _CLOSERS and url.count(last) > url.count(_CLOSERS[last]):
            url = url[:-1]
        else:
            break
    return url


def _scan(text: str) -> Iterator[tuple[int, int, str]]:
    """``(start, end, url)`` for every URL-looking token (``www.`` gets an ``https://``)."""
    for match in _URL.finditer(text):
        raw = _trim(match.group())
        url = raw if raw.lower().startswith(("http://", "https://")) else f"https://{raw}"
        host = host_of(url)
        if not host or "." not in host:
            continue
        yield match.start(), match.start() + len(raw), url


def find_urls(text: str) -> list[str]:
    """Every ``http(s)://`` and bare ``www.`` URL, deduplicated, in order of appearance."""
    seen: dict[str, None] = {}
    for _, _, url in _scan(text):
        seen.setdefault(url, None)
    return list(seen)


def host_of(url: str) -> str:
    try:
        return (urlsplit(url).hostname or "").lower().removeprefix("www.")
    except ValueError:
        return ""


def is_ignored_host(host: str, extra: Iterable[str] = ()) -> bool:
    ignored = IGNORED_HOSTS | {h.lower().removeprefix("www.") for h in extra if h}
    return host.removeprefix("www.") in ignored


def extract_urls(
    text: str, *, ignored_hosts: Iterable[str] = (), limit: int = MAX_URLS
) -> Extraction:
    """The proposal URLs of a message: ignored hosts dropped, capped at ``limit``."""
    extra = tuple(ignored_hosts)
    kept: list[str] = []
    ignored = 0
    for url in find_urls(text):
        if is_ignored_host(host_of(url), extra):
            ignored += 1
        else:
            kept.append(url)
    return Extraction(urls=kept[:limit], ignored=ignored, overflow=max(0, len(kept) - limit))


def text_without_urls(text: str) -> str:
    """``text`` with every URL removed and whitespace collapsed (the note that came with a link)."""
    pieces: list[str] = []
    cursor = 0
    for start, end, _ in _scan(text):
        pieces.append(text[cursor:start])
        cursor = end
        while cursor < len(text) and text[cursor] in _TRAILING + ")]}":  # punctuation hugging it
            cursor += 1
    pieces.append(text[cursor:])
    return re.sub(r"\s+", " ", "".join(pieces)).strip()


# --- Google Maps coordinates ------------------------------------------------------------------

_NUMBER = r"-?\d{1,3}(?:\.\d+)?"
_COORD_PATTERNS = (
    re.compile(rf"!3d({_NUMBER})!4d({_NUMBER})"),  # the place itself, preferred over the viewport
    re.compile(rf"@({_NUMBER}),({_NUMBER})"),
    re.compile(rf"[?&;]q=({_NUMBER}),({_NUMBER})(?:&|$)"),
    re.compile(rf"[?&;]ll=({_NUMBER}),({_NUMBER})(?:&|$)"),
)


def is_maps_url(url: str) -> bool:
    parts = urlsplit(url)
    host = host_of(url)
    if host in {"maps.app.goo.gl", "maps.apple.com"} or re.match(r"^maps\.google\.", host):
        return True
    if host == "goo.gl":
        return parts.path.startswith("/maps")
    return bool(re.match(r"^google\.[a-z.]+$", host)) and parts.path.startswith("/maps")


def is_maps_short_link(url: str) -> bool:
    parts = urlsplit(url)
    host = host_of(url)
    return host == "maps.app.goo.gl" or (host == "goo.gl" and parts.path.startswith("/maps"))


def parse_maps_coordinates(url: str) -> tuple[float, float] | None:
    """``(lat, lng)`` from a Maps URL (``!3d!4d``, ``@``, ``q=``, ``ll=``), else ``None``."""
    if not is_maps_url(url):
        return None
    for pattern in _COORD_PATTERNS:
        match = pattern.search(url)
        if match is None:
            continue
        lat, lng = float(match.group(1)), float(match.group(2))
        if -90 <= lat <= 90 and -180 <= lng <= 180:
            return lat, lng
    return None


# --- tracking parameters and canonical form ---------------------------------------------------

_GLOBAL_TRACKING = frozenset(
    "fbclid gclid gbraid wbraid dclid msclkid yclid igshid igsh mc_cid mc_eid _hsenc _hsmi ref "
    "ref_src si spm".split()
)
_HOST_TRACKING: tuple[tuple[re.Pattern[str], frozenset[str]], ...] = (
    (
        re.compile(r"(^|\.)booking\.com$"),
        frozenset(
            "aid label sid srpvid ucfs arphpl sb_price_type srepoch all_sr_blocks "
            "highlighted_blocks".split()
        ),
    ),
    (
        re.compile(r"(^|\.)airbnb\.[a-z.]+$"),
        frozenset(
            "source_impression_id previous_page_section_name federated_search_id "
            "unique_share_id guests_from_sharing".split()
        ),
    ),
    (
        re.compile(r"(^|\.)mercadolibre\.[a-z.]+$"),
        frozenset("tracking_id searchvariation position search_layout type".split()),
    ),
)
_DEFAULT_PORTS = {"http": 80, "https": 443}


def _pairs(query: str) -> list[str]:
    return [piece for piece in query.split("&") if piece]


def _key(piece: str) -> str:
    return piece.partition("=")[0]


def strip_tracking(url: str) -> str:
    """Drop ``utm_*`` and the other tracking parameters (global and per host); keep the rest."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    host_params = frozenset().union(*(names for rx, names in _HOST_TRACKING if rx.search(host)))

    def tracked(piece: str) -> bool:
        key = _key(piece).lower()
        return key.startswith("utm_") or key in _GLOBAL_TRACKING or key in host_params

    query = "&".join(piece for piece in _pairs(parts.query) if not tracked(piece))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


def _idna(host: str) -> str:
    try:
        return host.encode("idna").decode("ascii")
    except UnicodeError:
        return host


def canonicalize(url: str) -> str:
    """Lowercase scheme and host, no ``www.``, default port, userinfo or fragment, IDNA host,
    sorted query, no trailing slash (the root keeps its ``/``)."""
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    host = _idna((parts.hostname or "").lower().removeprefix("www."))
    if ":" in host:
        host = f"[{host}]"
    try:
        port = parts.port
    except ValueError:
        port = None
    netloc = host if port in (None, _DEFAULT_PORTS.get(scheme)) else f"{host}:{port}"
    path = parts.path.rstrip("/") or "/"
    query = "&".join(sorted(_pairs(parts.query), key=lambda piece: (_key(piece), piece)))
    return urlunsplit((scheme, netloc, path, query, ""))


def normalize(url: str) -> str:
    """The dedupe key of a URL: tracking parameters stripped, then canonicalized."""
    return canonicalize(strip_tracking(url))


def canonical_after_redirect(url: str, final_url: str) -> str:
    """Maps short links are canonicalized after their redirect; every other URL as it came."""
    if final_url and is_maps_short_link(url):
        return normalize(final_url)
    return normalize(url)


_EXTENSION = re.compile(r"\.(html?|php|aspx?|jsp|pdf)$", re.IGNORECASE)


def slug_title(url: str) -> str:
    """A readable title from the last path segment (or the host): the fallback for blocked pages."""
    parts = urlsplit(url)
    segments = [segment for segment in parts.path.split("/") if segment]
    if segments:
        slug = _EXTENSION.sub("", unquote(segments[-1]))
        slug = re.sub(r"[-_+\s]+", " ", slug).strip()
        if slug:
            return slug
    return host_of(url)
