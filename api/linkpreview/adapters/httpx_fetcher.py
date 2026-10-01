"""The SSRF-guarded fetcher: resolve, validate, pin the connection to the validated IP.

Every hop (the first request and each redirect) goes through the same pipeline: ``check_url`` →
DNS → every record must be public → connect to that IP with the original ``Host`` header and TLS
``server_hostname`` (``sni_hostname`` extension), so a DNS answer that changes between validation
and connection cannot redirect us. Redirects are followed manually (at most 4), bodies are
streamed and cut at the byte cap, and the environment proxies are ignored.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

import httpx

from linkpreview import conf
from linkpreview.adapters.html_parser import parse_page
from linkpreview.adapters.resolver import SystemResolver
from linkpreview.adapters.thumbnail import MAX_IMAGE_BYTES, ThumbnailError, make_thumbnail
from linkpreview.domain.preview import PreviewData, blocked_preview, failed_preview, finalize
from linkpreview.domain.ssrf import BlockedUrlError, check_url, choose_address, resolve_location
from linkpreview.ports import Resolver

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0 Safari/537.36"
)
HTML_TYPES = frozenset({"text/html", "application/xhtml+xml"})
IMAGE_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})
REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
BLOCKING_STATUSES = frozenset({401, 403, 429, 451})
Kind = Literal["html", "image"]


class FetchError(Exception):
    """The fetch failed. ``blocked`` failures are final (the site refuses us), others retry."""

    def __init__(self, code: str, *, blocked: bool = False, final_url: str = "") -> None:
        super().__init__(code)
        self.code = code
        self.blocked = blocked
        self.final_url = final_url


@dataclass(frozen=True)
class FetchedBody:
    url: str  # the final URL (after redirects), never the pinned-IP one
    status: int
    content_type: str
    body: bytes
    truncated: bool = False


def _pinned_url(scheme: str, ip: str, port: int, path_and_query: str) -> str:
    host = f"[{ip}]" if ":" in ip else ip
    default = 443 if scheme == "https" else 80
    return f"{scheme}://{host}{'' if port == default else f':{port}'}{path_and_query}"


class GuardedClient:
    def __init__(
        self,
        resolver: Resolver,
        *,
        clock: Callable[[], float] = time.monotonic,
        total_timeout: float = conf.TOTAL_TIMEOUT_SECONDS,
        connect_timeout: float = conf.CONNECT_TIMEOUT_SECONDS,
        max_redirects: int = conf.MAX_REDIRECTS,
    ) -> None:
        self._resolver = resolver
        self._clock = clock
        self._total = total_timeout
        self._connect = connect_timeout
        self._max_redirects = max_redirects

    def get(
        self,
        url: str,
        *,
        kind: Kind,
        max_bytes: int | None = None,
        deadline: float | None = None,
    ) -> FetchedBody:
        """GET ``url`` through the guard. Raises ``BlockedUrlError`` or ``FetchError``."""
        deadline = self._clock() + self._total if deadline is None else deadline
        limit = max_bytes or (MAX_IMAGE_BYTES if kind == "image" else conf.max_bytes())
        current = url
        with httpx.Client(trust_env=False, follow_redirects=False) as http:
            for hop in range(self._max_redirects + 1):
                response = self._hop(http, current, kind, limit, deadline)
                if isinstance(response, FetchedBody):
                    return response
                if hop == self._max_redirects:
                    raise FetchError("too_many_redirects", blocked=True, final_url=current)
                current = resolve_location(current, response)
        raise AssertionError("unreachable")  # pragma: no cover

    def _hop(
        self, http: httpx.Client, url: str, kind: Kind, limit: int, deadline: float
    ) -> FetchedBody | str:
        """One request: the body, or the ``Location`` to follow."""
        remaining = deadline - self._clock()
        if remaining <= 0:
            raise FetchError("timeout", final_url=url)
        target = check_url(url)
        ip = choose_address(target.host, self._resolver.resolve(target.host))
        default = 443 if target.scheme == "https" else 80
        host_header = target.host if target.port == default else f"{target.host}:{target.port}"
        headers = {
            "Host": host_header,
            "User-Agent": USER_AGENT,
            "Accept-Language": "es-AR,es;q=0.9,en;q=0.6",
            "Accept": (
                "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"
                if kind == "html"
                else "image/webp,image/jpeg,image/png,image/gif;q=0.9"
            ),
        }
        timeout = httpx.Timeout(
            connect=min(self._connect, remaining), read=remaining, write=remaining, pool=remaining
        )
        try:
            with http.stream(
                "GET",
                _pinned_url(target.scheme, ip, target.port, target.path_and_query),
                headers=headers,
                extensions={"sni_hostname": target.host},
                timeout=timeout,
            ) as response:
                return self._read(response, url, kind, limit, deadline)
        except httpx.TimeoutException as exc:
            raise FetchError("timeout", final_url=url) from exc
        except httpx.ConnectError as exc:
            raise FetchError("connect_error", final_url=url) from exc
        except (httpx.TransportError, httpx.DecodingError) as exc:
            raise FetchError("network_error", final_url=url) from exc

    def _read(
        self, response: httpx.Response, url: str, kind: Kind, limit: int, deadline: float
    ) -> FetchedBody | str:
        status = response.status_code
        if status in REDIRECT_STATUSES:
            location = response.headers.get("location", "").strip()
            if not location:
                raise FetchError("bad_redirect", final_url=url)
            return location
        if status >= 400:
            raise FetchError(f"http_{status}", blocked=status in BLOCKING_STATUSES, final_url=url)
        content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
        allowed = HTML_TYPES if kind == "html" else IMAGE_TYPES
        if content_type not in allowed:
            code = "not_html" if kind == "html" else "not_image"
            raise FetchError(code, blocked=True, final_url=url)
        body = bytearray()
        truncated = False
        for chunk in response.iter_bytes():
            body.extend(chunk)
            if len(body) > limit:
                if kind == "image":
                    raise FetchError("image_too_large", blocked=True, final_url=url)
                del body[limit:]
                truncated = True
                break
            if self._clock() > deadline:
                raise FetchError("timeout", final_url=url)
        return FetchedBody(url, status, content_type, bytes(body), truncated)


class HttpxLinkPreviewFetcher:
    """Unfurls a URL: page → metadata → (optional) thumbnail. Failures become preview values."""

    def __init__(
        self,
        resolver: Resolver | None = None,
        *,
        client: GuardedClient | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = client or GuardedClient(resolver or SystemResolver(), clock=clock)
        self._clock = clock

    def unfurl(self, url: str) -> PreviewData:
        deadline = self._clock() + conf.TOTAL_TIMEOUT_SECONDS
        try:
            page = self._client.get(url, kind="html", deadline=deadline)
        except BlockedUrlError as exc:
            return blocked_preview(url, exc.code)
        except FetchError as exc:
            build = blocked_preview if exc.blocked else failed_preview
            return build(url, exc.code, final_url=exc.final_url)
        meta = parse_page(page.body, page.url)
        thumbnail = self._thumbnail(meta.image_url, deadline) if meta.image_url else None
        return finalize(url, page.url, meta, thumbnail)

    def _thumbnail(self, image_url: str, deadline: float) -> bytes | None:
        if deadline - self._clock() < 0.5:
            return None
        try:
            image = self._client.get(image_url, kind="image", deadline=deadline)
            return make_thumbnail(image.body)
        except (BlockedUrlError, FetchError, ThumbnailError):
            return None
