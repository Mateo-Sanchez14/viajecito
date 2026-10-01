import pytest

from linkpreview.domain.urls import (
    canonical_after_redirect,
    canonicalize,
    slug_title,
    strip_tracking,
)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://a.com/x?utm_source=wa&utm_medium=x&id=3", "https://a.com/x?id=3"),
        ("https://a.com/x?UTM_Campaign=1&id=3", "https://a.com/x?id=3"),
        (
            "https://a.com/x?fbclid=1&gclid=2&gbraid=3&wbraid=4&dclid=5&msclkid=6&yclid=7",
            "https://a.com/x",
        ),
        ("https://a.com/x?igshid=1&igsh=2&mc_cid=3&mc_eid=4&_hsenc=5&_hsmi=6", "https://a.com/x"),
        ("https://a.com/x?ref=1&ref_src=2&si=3&spm=4&keep=1", "https://a.com/x?keep=1"),
        (
            "https://www.booking.com/hotel/ar/x.html?aid=1&label=2&sid=3&srpvid=4&ucfs=1"
            "&arphpl=1&sb_price_type=total&srepoch=1&all_sr_blocks=1&highlighted_blocks=1&checkin=2026-01-01",
            "https://www.booking.com/hotel/ar/x.html?checkin=2026-01-01",
        ),
        (
            "https://www.airbnb.com.ar/rooms/1?source_impression_id=1&previous_page_section_name=2"
            "&federated_search_id=3&unique_share_id=4&guests_from_sharing=5&adults=2",
            "https://www.airbnb.com.ar/rooms/1?adults=2",
        ),
        (
            "https://articulo.mercadolibre.com.ar/MLA-1?tracking_id=1&searchVariation=2&position=3"
            "&search_layout=4&type=5&q=6",
            "https://articulo.mercadolibre.com.ar/MLA-1?q=6",
        ),
    ],
)
def test_strip_tracking(url, expected):
    assert strip_tracking(url) == expected


def test_host_specific_params_stay_on_other_hosts():
    url = "https://a.com/x?aid=1&label=2&position=3"
    assert strip_tracking(url) == url


def test_strip_tracking_keeps_valueless_params_and_fragments():
    assert strip_tracking("https://a.com/x?flag&utm_source=1#frag") == "https://a.com/x?flag#frag"


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("HTTPS://WWW.Example.COM/Path", "https://example.com/Path"),
        ("http://example.com:80/x", "http://example.com/x"),
        ("https://example.com:443/x", "https://example.com/x"),
        ("https://example.com:8443/x", "https://example.com:8443/x"),
        ("https://example.com/x#section", "https://example.com/x"),
        ("https://example.com/x/", "https://example.com/x"),
        ("https://example.com/", "https://example.com/"),
        ("https://example.com", "https://example.com/"),
        ("https://example.com/x?b=2&a=1&a=0", "https://example.com/x?a=0&a=1&b=2"),
        ("https://user:pass@example.com/x", "https://example.com/x"),
        ("https://bücher.example/x", "https://xn--bcher-kva.example/x"),
        ("https://example.com/x?", "https://example.com/x"),
    ],
)
def test_canonicalize(url, expected):
    assert canonicalize(url) == expected


def test_same_page_different_spellings_share_a_canonical_form():
    first = canonicalize(strip_tracking("https://www.booking.com/h/x.html?utm_source=a&b=1&a=2#r"))
    second = canonicalize(strip_tracking("http://booking.com:80/h/x.html/?a=2&b=1&aid=7"))
    assert first == "https://booking.com/h/x.html?a=2&b=1"
    assert second == "http://booking.com/h/x.html?a=2&b=1"  # scheme is kept: no guessing https


def test_maps_short_links_canonicalize_after_the_redirect():
    short = "https://maps.app.goo.gl/AbC123"
    final = "https://www.google.com/maps/place/Refugio/@-41.15,-71.31,17z?entry=tts&g_ep=x"
    assert canonical_after_redirect(short, final) == canonicalize(final)
    assert canonical_after_redirect("https://a.com/x", "https://a.com/y") == "https://a.com/x"
    assert canonical_after_redirect(short, "") == canonicalize(short)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.booking.com/hotel/ar/cabanas-del-sur.html?x=1", "cabanas del sur"),
        ("https://example.com/wiki/Foo_Bar", "Foo Bar"),
        ("https://example.com/", "example.com"),
        ("https://example.com/a/b/", "b"),
        ("https://example.com/%C3%A1rbol-grande", "árbol grande"),
    ],
)
def test_slug_title(url, expected):
    assert slug_title(url) == expected
