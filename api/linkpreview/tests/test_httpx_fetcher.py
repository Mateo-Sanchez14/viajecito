import io
from pathlib import Path

import httpx
import pytest
import respx
from PIL import Image

from linkpreview.adapters.httpx_fetcher import FetchError, GuardedClient, HttpxLinkPreviewFetcher
from linkpreview.domain.ssrf import BlockedUrlError

HTML = Path(__file__).parent / "fixtures" / "html"
PAGE_IP = "93.184.216.34"
IMG_IP = "151.101.1.1"


class FakeResolver:
    def __init__(self, table: dict[str, list[str]] | None = None) -> None:
        self.table = table or {}
        self.calls: list[str] = []

    def resolve(self, host: str) -> list[str]:
        self.calls.append(host)
        return self.table.get(host, [PAGE_IP])


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def html_response(body: bytes = b"<title>ok</title>", status=200, **headers):
    return httpx.Response(status, content=body, headers={"content-type": "text/html", **headers})


def jpeg(size=(900, 600)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, "navy").save(buffer, "JPEG")
    return buffer.getvalue()


@pytest.fixture
def resolver():
    return FakeResolver()


@pytest.fixture
def client(resolver):
    return GuardedClient(resolver)


def get_page(client, url="https://example.com/page", **kwargs):
    return client.get(url, kind="html", **kwargs)


# --- pinning ------------------------------------------------------------------------------------


@respx.mock
def test_connects_to_the_pinned_ip_with_the_original_host_and_sni(client, resolver):
    route = respx.get(f"https://{PAGE_IP}/page").mock(return_value=html_response())
    page = get_page(client)
    request = route.calls.last.request
    assert request.url.host == PAGE_IP
    assert request.headers["host"] == "example.com"
    assert request.extensions["sni_hostname"] == "example.com"
    assert (
        page.url == "https://example.com/page"
    )  # callers see the original URL, not the pinned one
    assert resolver.calls == ["example.com"]


@respx.mock
def test_non_default_port_is_kept_in_the_host_header():
    resolver = FakeResolver()
    route = respx.get(f"http://{PAGE_IP}:80/x").mock(return_value=html_response())
    GuardedClient(resolver).get("http://example.com:80/x", kind="html")
    assert route.calls.last.request.headers["host"] == "example.com"


@respx.mock
def test_ipv6_addresses_are_bracketed_when_pinned():
    resolver = FakeResolver({"example.com": ["2606:4700:4700::1111"]})
    route = respx.get("https://[2606:4700:4700::1111]/page").mock(return_value=html_response())
    GuardedClient(resolver).get("https://example.com/page", kind="html")
    assert route.called


@respx.mock
def test_sends_a_browser_like_user_agent_and_spanish_accept_language(client):
    route = respx.get(f"https://{PAGE_IP}/page").mock(return_value=html_response())
    get_page(client)
    headers = route.calls.last.request.headers
    assert "Mozilla/5.0" in headers["user-agent"]
    assert headers["accept-language"].startswith("es")
    assert "text/html" in headers["accept"]


@respx.mock
def test_the_environment_proxy_is_never_used(monkeypatch, client):
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy.invalid:3128")
    route = respx.get(f"https://{PAGE_IP}/page").mock(return_value=html_response())
    get_page(client)
    assert route.called


def test_blocked_resolution_never_opens_a_connection():
    resolver = FakeResolver({"example.com": ["10.0.0.7"]})
    with respx.mock(assert_all_called=False) as router:
        with pytest.raises(BlockedUrlError) as raised:
            GuardedClient(resolver).get("https://example.com/", kind="html")
        assert raised.value.code == "blocked_address"
        assert not router.calls


def test_one_private_record_among_public_ones_blocks_the_host():
    resolver = FakeResolver({"example.com": [PAGE_IP, "192.168.1.1"]})
    with pytest.raises(BlockedUrlError):
        GuardedClient(resolver).get("https://example.com/", kind="html")


def test_syntactically_bad_urls_are_blocked_before_dns():
    resolver = FakeResolver()
    with pytest.raises(BlockedUrlError):
        GuardedClient(resolver).get("https://127.0.0.1/", kind="html")
    assert resolver.calls == []


# --- redirects ----------------------------------------------------------------------------------


def chain(length: int, final_status=200):
    """a0 -> a1 -> ... -> a<length>; the last one answers ``final_status``."""
    for i in range(length):
        respx.get(f"https://{PAGE_IP}/hop{i}", headers={"host": "example.com"}).mock(
            return_value=httpx.Response(
                302, headers={"location": f"https://example.com/hop{i + 1}"}
            )
        )
    respx.get(f"https://{PAGE_IP}/hop{length}", headers={"host": "example.com"}).mock(
        return_value=html_response() if final_status == 200 else httpx.Response(final_status)
    )


@respx.mock
def test_four_redirects_are_followed_and_each_hop_is_resolved(client, resolver):
    chain(4)
    page = get_page(client, "https://example.com/hop0")
    assert page.url == "https://example.com/hop4"
    assert resolver.calls == ["example.com"] * 5


@respx.mock
def test_the_fifth_redirect_is_rejected(client):
    chain(5)
    with pytest.raises(FetchError) as raised:
        get_page(client, "https://example.com/hop0")
    assert raised.value.code == "too_many_redirects"
    assert raised.value.blocked


@respx.mock
def test_relative_locations_resolve_against_the_current_url(client):
    respx.get(f"https://{PAGE_IP}/a/b").mock(
        return_value=httpx.Response(301, headers={"location": "../c"})
    )
    respx.get(f"https://{PAGE_IP}/c").mock(return_value=html_response())
    assert get_page(client, "https://example.com/a/b").url == "https://example.com/c"


@pytest.mark.parametrize(
    ("location", "table", "code"),
    [
        ("http://127.0.0.1/admin", {}, "numeric_host"),
        ("http://169.254.169.254/latest/meta-data", {}, "numeric_host"),
        (
            "https://internal.example.net/",
            {"internal.example.net": ["10.1.2.3"]},
            "blocked_address",
        ),
        ("https://rebind.example.net/", {"rebind.example.net": ["127.0.0.1"]}, "blocked_address"),
        ("ftp://example.com/x", {}, "invalid_scheme"),
        ("https://example.com:8443/x", {}, "bad_port"),
        ("https://user:pw@example.com/x", {}, "userinfo"),
        ("//localhost/x", {}, "blocked_name"),
    ],
)
@respx.mock
def test_every_redirect_hop_is_revalidated(location, table, code):
    respx.get(f"https://{PAGE_IP}/start").mock(
        return_value=httpx.Response(302, headers={"location": location})
    )
    with pytest.raises(BlockedUrlError) as raised:
        GuardedClient(FakeResolver(table)).get("https://example.com/start", kind="html")
    assert raised.value.code == code


@respx.mock
def test_a_redirect_without_location_is_a_failure(client):
    respx.get(f"https://{PAGE_IP}/page").mock(return_value=httpx.Response(302))
    with pytest.raises(FetchError) as raised:
        get_page(client)
    assert raised.value.code == "bad_redirect"


# --- response handling ------------------------------------------------------------------------


@respx.mock
@pytest.mark.parametrize("content_type", ["application/pdf", "application/json", "image/png", ""])
def test_non_html_responses_are_rejected(client, content_type):
    respx.get(f"https://{PAGE_IP}/page").mock(
        return_value=httpx.Response(200, content=b"%PDF", headers={"content-type": content_type})
    )
    with pytest.raises(FetchError) as raised:
        get_page(client)
    assert (raised.value.code, raised.value.blocked) == ("not_html", True)


@respx.mock
def test_html_with_charset_and_xhtml_are_accepted(client):
    respx.get(f"https://{PAGE_IP}/page").mock(
        return_value=html_response(headers=None)
        if False
        else httpx.Response(
            200, content=b"<title>x</title>", headers={"content-type": "Text/HTML; charset=UTF-8"}
        )
    )
    assert get_page(client).body == b"<title>x</title>"
    respx.get(f"https://{PAGE_IP}/x").mock(
        return_value=httpx.Response(
            200, content=b"<x/>", headers={"content-type": "application/xhtml+xml"}
        )
    )
    assert get_page(client, "https://example.com/x").body == b"<x/>"


@respx.mock
@pytest.mark.parametrize(
    ("status", "blocked"), [(403, True), (429, True), (401, True), (404, False), (503, False)]
)
def test_http_errors(client, status, blocked):
    respx.get(f"https://{PAGE_IP}/page").mock(return_value=httpx.Response(status))
    with pytest.raises(FetchError) as raised:
        get_page(client)
    assert (raised.value.code, raised.value.blocked) == (f"http_{status}", blocked)


@respx.mock
def test_the_body_is_capped_and_the_stream_is_abandoned(client):
    consumed = []

    def stream():
        for i in range(200):
            consumed.append(i)
            yield b"x" * 65_536

    respx.get(f"https://{PAGE_IP}/page").mock(
        return_value=httpx.Response(200, content=stream(), headers={"content-type": "text/html"})
    )
    page = get_page(client, max_bytes=1_048_576)
    assert len(page.body) == 1_048_576
    assert page.truncated
    assert len(consumed) < 40  # nowhere near the 12 MB on offer


@respx.mock
def test_gzip_bombs_are_capped_on_the_decoded_size(client):
    import gzip

    bomb = gzip.compress(b"a" * 20_000_000)
    respx.get(f"https://{PAGE_IP}/page").mock(
        return_value=httpx.Response(
            200, content=bomb, headers={"content-type": "text/html", "content-encoding": "gzip"}
        )
    )
    assert len(get_page(client, max_bytes=1_048_576).body) == 1_048_576


@respx.mock
@pytest.mark.parametrize(
    ("error", "code"),
    [
        (httpx.ConnectTimeout("t"), "timeout"),
        (httpx.ReadTimeout("t"), "timeout"),
        (httpx.ConnectError("c"), "connect_error"),
        (httpx.RemoteProtocolError("p"), "network_error"),
    ],
)
def test_network_errors_are_retryable_failures(client, error, code):
    respx.get(f"https://{PAGE_IP}/page").mock(side_effect=error)
    with pytest.raises(FetchError) as raised:
        get_page(client)
    assert (raised.value.code, raised.value.blocked) == (code, False)


@respx.mock
def test_the_total_budget_is_enforced_across_hops():
    clock = FakeClock()
    calls = []

    def slow_redirect(request):
        calls.append(request.url.path)
        clock.now += 5  # each hop "takes" 5 s: the 8 s budget is gone after the second
        return httpx.Response(302, headers={"location": "https://example.com/next"})

    respx.get(host=PAGE_IP).mock(side_effect=slow_redirect)
    with pytest.raises(FetchError) as raised:
        GuardedClient(FakeResolver(), clock=clock).get("https://example.com/start", kind="html")
    assert raised.value.code == "timeout"
    assert len(calls) == 2


# --- images -------------------------------------------------------------------------------------


@respx.mock
def test_images_accept_only_raster_types_up_to_5mb(client):
    respx.get(f"https://{PAGE_IP}/ok.jpg").mock(
        return_value=httpx.Response(200, content=jpeg(), headers={"content-type": "image/jpeg"})
    )
    assert client.get("https://example.com/ok.jpg", kind="image").body[:2] == b"\xff\xd8"
    respx.get(f"https://{PAGE_IP}/x.svg").mock(
        return_value=httpx.Response(
            200, content=b"<svg/>", headers={"content-type": "image/svg+xml"}
        )
    )
    with pytest.raises(FetchError) as raised:
        client.get("https://example.com/x.svg", kind="image")
    assert raised.value.code == "not_image"


@respx.mock
def test_oversized_images_are_rejected_not_truncated(client):
    respx.get(f"https://{PAGE_IP}/big.jpg").mock(
        return_value=httpx.Response(
            200, content=b"\xff" * (5 * 1024 * 1024 + 10), headers={"content-type": "image/png"}
        )
    )
    with pytest.raises(FetchError) as raised:
        client.get("https://example.com/big.jpg", kind="image")
    assert raised.value.code == "image_too_large"


# --- the whole unfurl -------------------------------------------------------------------------


def fetcher(table=None):
    return HttpxLinkPreviewFetcher(FakeResolver({"cdn.example.net": [IMG_IP], **(table or {})}))


@respx.mock
def test_unfurl_parses_the_page_and_builds_a_webp_thumbnail():
    page = (
        (HTML / "booking.html")
        .read_bytes()
        .replace(
            b"https://cf.bstatic.com/xdata/images/hotel/max1024x768/123.jpg?k=abc",
            b"https://cdn.example.net/hotel.jpg",
        )
    )
    respx.get(f"https://{PAGE_IP}/hotel/ar/x.html").mock(return_value=html_response(page))
    respx.get(f"https://{IMG_IP}/hotel.jpg").mock(
        return_value=httpx.Response(200, content=jpeg(), headers={"content-type": "image/jpeg"})
    )
    preview = fetcher().unfurl("https://example.com/hotel/ar/x.html")
    assert preview.fetch_status == "ok"
    assert preview.title == "Cabañas del Sur, San Martín de los Andes"
    assert preview.thumbnail is not None
    assert Image.open(io.BytesIO(preview.thumbnail)).format == "WEBP"


@respx.mock
def test_unfurl_survives_a_broken_image():
    page = b'<meta property="og:title" content="T"><meta property="og:image" content="https://cdn.example.net/x.png">'
    respx.get(f"https://{PAGE_IP}/p").mock(return_value=html_response(page))
    respx.get(f"https://{IMG_IP}/x.png").mock(return_value=httpx.Response(404))
    preview = fetcher().unfurl("https://example.com/p")
    assert (preview.fetch_status, preview.title, preview.thumbnail) == ("ok", "T", None)


@respx.mock
def test_unfurl_never_fetches_an_image_on_a_private_host():
    page = b'<meta property="og:title" content="T"><meta property="og:image" content="http://169.254.169.254/latest">'
    respx.get(f"https://{PAGE_IP}/p").mock(return_value=html_response(page))
    preview = fetcher().unfurl("https://example.com/p")
    assert preview.thumbnail is None
    assert [call.request.url.host for call in respx.calls] == [PAGE_IP]


@respx.mock
def test_unfurl_turns_failures_into_values():
    respx.get(f"https://{PAGE_IP}/forbidden-hotel.html").mock(return_value=httpx.Response(403))
    blocked = fetcher().unfurl("https://example.com/forbidden-hotel.html")
    assert (blocked.fetch_status, blocked.fetch_error, blocked.title) == (
        "blocked",
        "http_403",
        "forbidden hotel",
    )
    respx.get(f"https://{PAGE_IP}/down").mock(side_effect=httpx.ConnectTimeout("t"))
    failed = fetcher().unfurl("https://example.com/down")
    assert (failed.fetch_status, failed.fetch_error) == ("failed", "timeout")
    ssrf = fetcher({"evil.example.net": ["127.0.0.1"]}).unfurl("https://evil.example.net/x")
    assert (ssrf.fetch_status, ssrf.fetch_error) == ("blocked", "blocked_address")
    pdf_url = "https://example.com/menu.pdf"
    respx.get(f"https://{PAGE_IP}/menu.pdf").mock(
        return_value=httpx.Response(
            200, content=b"%PDF", headers={"content-type": "application/pdf"}
        )
    )
    pdf = fetcher().unfurl(pdf_url)
    assert (pdf.fetch_status, pdf.fetch_error, pdf.title) == ("blocked", "not_html", "menu")


@respx.mock
def test_unfurl_reports_the_final_url_after_redirects():
    respx.get(f"https://{PAGE_IP}/short").mock(
        return_value=httpx.Response(302, headers={"location": "https://example.com/long/place"})
    )
    respx.get(f"https://{PAGE_IP}/long/place").mock(return_value=html_response())
    assert (
        fetcher().unfurl("https://example.com/short").final_url == "https://example.com/long/place"
    )
