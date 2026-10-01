"""Every rule of the SSRF guard as a table row (DNS is faked: the domain is pure)."""

import ipaddress

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from linkpreview.domain.ssrf import (
    BlockedUrlError,
    check_url,
    choose_address,
    is_blocked_address,
    resolve_location,
)

OK_URLS = [
    ("http://example.com/a?b=1", "http", "example.com", 80, "/a?b=1"),
    ("https://www.Example.COM", "https", "www.example.com", 443, "/"),
    ("https://example.com:443/x", "https", "example.com", 443, "/x"),
    ("http://example.com:80/", "http", "example.com", 80, "/"),
    ("https://example.com:80/x", "https", "example.com", 80, "/x"),
    ("https://bücher.example/x", "https", "xn--bcher-kva.example", 443, "/x"),
    ("https://example.com./x", "https", "example.com", 443, "/x"),
    ("https://xn--bcher-kva.example/x#f", "https", "xn--bcher-kva.example", 443, "/x"),
]


@pytest.mark.parametrize(("url", "scheme", "host", "port", "path"), OK_URLS)
def test_valid_urls_become_targets(url, scheme, host, port, path):
    target = check_url(url)
    assert (target.scheme, target.host, target.port, target.path_and_query) == (
        scheme,
        host,
        port,
        path,
    )


REJECTED_URLS = [
    ("ftp://example.com/x", "invalid_scheme"),
    ("file:///etc/passwd", "invalid_scheme"),
    ("gopher://example.com", "invalid_scheme"),
    ("javascript:alert(1)", "invalid_scheme"),
    ("//example.com/x", "invalid_scheme"),
    ("https://user:pass@example.com/", "userinfo"),
    ("https://user@example.com/", "userinfo"),
    ("https://example.com@evil.com/", "userinfo"),
    ("https://example.com:8080/", "bad_port"),
    ("https://example.com:22/", "bad_port"),
    ("https://example.com:99999/", "bad_port"),
    ("https://example.com:abc/", "bad_port"),
    ("https://localhost/", "blocked_name"),
    ("https://foo.localhost/", "blocked_name"),
    ("https://printer.local/", "blocked_name"),
    ("https://db.internal/", "blocked_name"),
    ("https://LOCALHOST./", "blocked_name"),
    ("https://intranet/", "bad_host"),
    ("https://singlelabel/", "bad_host"),
    ("https:///path", "bad_host"),
    ("https://[::1]/", "numeric_host"),
    ("https://[::ffff:127.0.0.1]/", "numeric_host"),
    ("https://[fd00::1]/", "numeric_host"),
    ("https://127.0.0.1/", "numeric_host"),
    ("https://0.0.0.0/", "numeric_host"),
    ("https://169.254.169.254/latest/meta-data", "numeric_host"),
    ("https://10.0.0.1/", "numeric_host"),
    ("https://192.168.1.1/", "numeric_host"),
    ("https://100.64.0.1/", "numeric_host"),
    ("https://2130706433/", "bad_host"),  # decimal 127.0.0.1, no dot
    ("https://0x7f000001/", "bad_host"),
    ("https://0177.0.0.1/", "numeric_host"),  # octal
    ("https://0x7f.0.0.1/", "numeric_host"),
    ("https://0x7f.0x0.0x0.0x1/", "numeric_host"),
    ("https://127.1/", "numeric_host"),
    ("https://example.com\\@evil.com/", "invalid_url"),
    ("https://exa mple.com/", "invalid_url"),
    ("https://example.com/\n", "invalid_url"),
    ("https://example.com/\x00", "invalid_url"),
    ("", "invalid_scheme"),
]


@pytest.mark.parametrize(("url", "code"), REJECTED_URLS)
def test_rejected_urls(url, code):
    with pytest.raises(BlockedUrlError) as raised:
        check_url(url)
    assert raised.value.code == code


def test_overlong_urls_are_rejected():
    with pytest.raises(BlockedUrlError) as raised:
        check_url("https://example.com/" + "a" * 2100)
    assert raised.value.code == "invalid_url"


BLOCKED_ADDRESSES = [
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.10",
    "169.254.169.254",
    "169.254.0.1",
    "100.64.0.1",
    "100.127.255.254",
    "0.0.0.0",
    "224.0.0.1",
    "239.255.255.250",
    "240.0.0.1",
    "255.255.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "::1",
    "::",
    "fe80::1",
    "fec0::1",
    "feff::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:8.8.8.8",  # even a public IPv4-mapped address is refused
    "64:ff9b::7f00:1",
    "2002:7f00:1::1",
    "not an ip",
]


@pytest.mark.parametrize("address", BLOCKED_ADDRESSES)
def test_blocked_addresses(address):
    assert is_blocked_address(address)


@pytest.mark.parametrize(
    "address", ["93.184.216.34", "8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2a00:1450:4009::65"]
)
def test_public_addresses_are_allowed(address):
    assert not is_blocked_address(address)


def test_choose_address_pins_the_first_when_every_record_is_allowed():
    assert (
        choose_address("example.com", ["93.184.216.34", "2606:4700:4700::1111"]) == "93.184.216.34"
    )


def test_one_blocked_record_rejects_the_host():
    with pytest.raises(BlockedUrlError) as raised:
        choose_address("example.com", ["93.184.216.34", "10.0.0.1"])
    assert raised.value.code == "blocked_address"


def test_blocked_record_listed_second_still_rejects_and_empty_is_a_dns_failure():
    with pytest.raises(BlockedUrlError) as raised:
        choose_address("example.com", ["::1"])
    assert raised.value.code == "blocked_address"
    with pytest.raises(BlockedUrlError) as raised:
        choose_address("example.com", [])
    assert raised.value.code == "dns_failure"


@pytest.mark.parametrize(
    ("current", "location", "expected"),
    [
        ("https://a.com/x/y", "/z", "https://a.com/z"),
        ("https://a.com/x/y", "z", "https://a.com/x/z"),
        ("https://a.com/x", "//b.com/q", "https://b.com/q"),
        ("https://a.com/x", "http://b.com/q", "http://b.com/q"),
        ("https://a.com/x?y=1", "?z=2", "https://a.com/x?z=2"),
    ],
)
def test_redirect_locations_resolve_against_the_current_url(current, location, expected):
    assert resolve_location(current, location) == expected


def test_redirect_to_a_blocked_target_is_caught_after_resolving():
    resolved = resolve_location("https://a.com/x", "//127.0.0.1/admin")
    with pytest.raises(BlockedUrlError):
        check_url(resolved)


# --- numeric spellings of blocked IPv4 addresses ------------------------------------------------


def spellings(address: int) -> list[str]:
    a, b, c, d = (address >> 24) & 255, (address >> 16) & 255, (address >> 8) & 255, address & 255
    return [
        str(address),  # decimal
        hex(address),  # 0x7f000001
        oct(address).replace("0o", "0"),  # octal
        f"{a}.{b}.{c}.{d}",
        f"{a:#x}.{b:#x}.{c:#x}.{d:#x}",
        f"{a:#o}.{b:#o}.{c:#o}.{d:#o}".replace("0o", "0"),
        f"{a}.{(b << 16) | (c << 8) | d}",
        f"{a}.{b}.{(c << 8) | d}",
        f"{a:#x}.{(b << 16) | (c << 8) | d}",
    ]


BLOCKED_V4_RANGES = [
    ipaddress.ip_network(net)
    for net in (
        "127.0.0.0/8",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "169.254.0.0/16",
        "100.64.0.0/10",
        "0.0.0.0/8",
    )
]


@settings(max_examples=300, deadline=None)
@given(data=st.data())
def test_numeric_host_spellings_of_blocked_ranges_are_rejected(data):
    network = data.draw(st.sampled_from(BLOCKED_V4_RANGES))
    offset = data.draw(st.integers(min_value=0, max_value=network.num_addresses - 1))
    address = int(network.network_address) + offset
    spelling = data.draw(st.sampled_from(spellings(address)))
    for scheme in ("http", "https"):
        with pytest.raises(BlockedUrlError):
            check_url(f"{scheme}://{spelling}/path")


@settings(max_examples=200, deadline=None)
@given(address=st.integers(min_value=0, max_value=2**32 - 1))
def test_no_numeric_spelling_of_any_ipv4_passes(address):
    for spelling in spellings(address):
        with pytest.raises(BlockedUrlError):
            check_url(f"https://{spelling}/")
