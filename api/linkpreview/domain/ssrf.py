"""SSRF guard rules (pure; DNS lookups and sockets live in the adapters).

``check_url`` validates a URL syntactically (scheme, userinfo, port, host spelling) and returns the
target to resolve; ``choose_address`` validates every address a host resolved to; the fetcher pins
the connection to the chosen address, so a rebinding DNS answer can never redirect the request.
"""

import ipaddress
import re
from collections.abc import Sequence
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

ALLOWED_PORTS = frozenset({80, 443})
MAX_URL_CHARS = 2000
_DEFAULT_PORTS = {"http": 80, "https": 443}
_BLOCKED_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
    ".localdomain",
    ".lan",
    ".intranet",
    ".corp",
    ".home.arpa",
)
_FORBIDDEN_CHARS = re.compile(r"[\s\x00-\x1f\x7f\\]")
_TLD = re.compile(r"^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$")

_BLOCKED_V6_NETWORKS = tuple(
    ipaddress.ip_network(net)
    for net in (
        "64:ff9b::/96",  # NAT64: can embed any IPv4 address
        "64:ff9b:1::/48",
        "2002::/16",  # 6to4
        "2001::/32",  # Teredo
        "fec0::/10",  # deprecated site-local
    )
)


class BlockedUrlError(ValueError):
    """The URL or one of its addresses is not allowed; ``code`` is a stable reason code."""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


@dataclass(frozen=True)
class UrlTarget:
    scheme: str
    host: str  # lowercase ASCII (IDNA), no trailing dot
    port: int
    path_and_query: str


def check_url(url: str) -> UrlTarget:
    """Validate ``url`` before any DNS lookup or connection."""
    if len(url) > MAX_URL_CHARS:
        raise BlockedUrlError("invalid_url", "URL is too long")
    parts = urlsplit(url)
    if parts.scheme.lower() not in _DEFAULT_PORTS:
        raise BlockedUrlError("invalid_scheme", "only http and https are allowed")
    if _FORBIDDEN_CHARS.search(url):
        raise BlockedUrlError("invalid_url", "whitespace, control characters and backslashes")
    if "@" in parts.netloc:
        raise BlockedUrlError("userinfo", "credentials in the URL are not allowed")
    try:
        port = parts.port
        hostname = parts.hostname
    except ValueError as exc:
        raise BlockedUrlError("bad_port", "invalid port") from exc
    scheme = parts.scheme.lower()
    port = _DEFAULT_PORTS[scheme] if port is None else port
    if port not in ALLOWED_PORTS:
        raise BlockedUrlError("bad_port", f"port {port} is not allowed")
    host = _check_host(hostname or "")
    path = parts.path or "/"
    path_and_query = f"{path}?{parts.query}" if parts.query else path
    return UrlTarget(scheme=scheme, host=host, port=port, path_and_query=path_and_query)


def _check_host(hostname: str) -> str:
    if not hostname:
        raise BlockedUrlError("bad_host", "missing host")
    if ":" in hostname:  # IPv6 literal
        raise BlockedUrlError("numeric_host", "IP literals are not allowed")
    host = hostname.lower().rstrip(".")
    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise BlockedUrlError("bad_host", "invalid host name") from exc
    if host == "localhost" or host.endswith(_BLOCKED_SUFFIXES):
        raise BlockedUrlError("blocked_name", "local host names are not allowed")
    if "." not in host:
        raise BlockedUrlError("bad_host", "host names need a dot")
    if not _TLD.match(host.rsplit(".", 1)[1]):
        # Every real TLD is alphabetic (or ``xn--``): numeric hosts in any spelling (decimal, hex,
        # octal, short forms, dotted quads) all end in a numeric label.
        raise BlockedUrlError("numeric_host", "numeric hosts are not allowed")
    return host


def is_blocked_address(address: str) -> bool:
    """True unless ``address`` is a publicly routable unicast IPv4/IPv6 address."""
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return True
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None or any(ip in net for net in _BLOCKED_V6_NETWORKS):
            return True
    return (
        ip.is_multicast
        or ip.is_unspecified
        or ip.is_reserved
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_private
        or not ip.is_global  # also CGNAT 100.64/10 and the documentation/benchmark ranges
    )


def choose_address(host: str, addresses: Sequence[str]) -> str:
    """The address to pin the connection to; EVERY resolved record must be allowed."""
    if not addresses:
        raise BlockedUrlError("dns_failure", f"{host} did not resolve")
    for address in addresses:
        if is_blocked_address(address):
            raise BlockedUrlError("blocked_address", f"{host} resolves to a blocked address")
    return addresses[0]


def resolve_location(current_url: str, location: str) -> str:
    """The absolute URL of a redirect ``Location`` header (re-validated by the caller)."""
    return urljoin(current_url, location)
