import pytest

from linkpreview.domain.urls import (
    MAX_URLS,
    extract_urls,
    find_urls,
    parse_maps_coordinates,
    text_without_urls,
)


def test_finds_several_urls_in_order_and_dedupes():
    text = "mirá https://a.com/x y https://b.com/y y de nuevo https://a.com/x"
    assert find_urls(text) == ["https://a.com/x", "https://b.com/y"]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("mirá https://a.com/x.", "https://a.com/x"),
        ("¿viste https://a.com/x?", "https://a.com/x"),
        ("(https://a.com/x)", "https://a.com/x"),
        ("https://a.com/x,", "https://a.com/x"),
        ("«https://a.com/x»", "https://a.com/x"),
        ('"https://a.com/x"', "https://a.com/x"),
        ("https://a.com/x!!!", "https://a.com/x"),
        ("https://es.wikipedia.org/wiki/Foo_(bar)", "https://es.wikipedia.org/wiki/Foo_(bar)"),
        (
            "(ver https://es.wikipedia.org/wiki/Foo_(bar))",
            "https://es.wikipedia.org/wiki/Foo_(bar)",
        ),
        ("[https://a.com/x]", "https://a.com/x"),
        ("https://a.com/x?q=1&r=2;", "https://a.com/x?q=1&r=2"),
    ],
)
def test_trailing_punctuation_and_unbalanced_brackets(text, expected):
    assert find_urls(text) == [expected]


def test_bare_www_gets_a_scheme():
    assert find_urls("entrá a www.hostelworld.com/s?q=1 che") == [
        "https://www.hostelworld.com/s?q=1"
    ]


def test_text_without_urls_has_nothing_to_extract():
    assert find_urls("hola, ¿cuándo viajamos? nos vemos a las 10.30") == []
    assert find_urls("") == []


def test_caps_at_three_and_reports_the_overflow():
    text = " ".join(f"https://a{i}.com" for i in range(5))
    result = extract_urls(text)
    assert MAX_URLS == 3
    assert result.urls == ["https://a0.com", "https://a1.com", "https://a2.com"]
    assert result.overflow == 2


@pytest.mark.parametrize(
    "url",
    [
        "https://wa.me/5491155551111",
        "https://chat.whatsapp.com/AbCdEf",
        "https://api.whatsapp.com/send?phone=1",
        "https://WA.me/x",
    ],
)
def test_whatsapp_hosts_are_ignored(url):
    result = extract_urls(f"entrá {url}")
    assert result.urls == []
    assert result.ignored == 1


def test_own_and_extra_hosts_are_ignored():
    text = "https://viajecito.example.com/crews/1 https://gastito.example.org/g/2 https://ok.com"
    result = extract_urls(text, ignored_hosts={"viajecito.example.com", "gastito.example.org"})
    assert result.urls == ["https://ok.com"]
    assert result.ignored == 2


def test_ignored_urls_do_not_use_up_the_cap():
    text = "https://wa.me/1 " + " ".join(f"https://a{i}.com" for i in range(3))
    assert len(extract_urls(text).urls) == 3


def test_maps_short_and_long_links_are_found():
    text = (
        "acá https://maps.app.goo.gl/AbC123 y "
        "https://www.google.com/maps/place/Refugio/@-41.15,-71.31,17z/data=!3d-41.1512!4d-71.3112"
    )
    assert find_urls(text) == [
        "https://maps.app.goo.gl/AbC123",
        "https://www.google.com/maps/place/Refugio/@-41.15,-71.31,17z/data=!3d-41.1512!4d-71.3112",
    ]


def test_text_without_urls_strips_the_links_and_collapses_spaces():
    text = "el finde  mirá https://a.com/x.  está bueno www.b.com/y!"
    assert text_without_urls(text) == "el finde mirá está bueno"


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.google.com/maps/place/X/@-41.15,-71.31,17z", (-41.15, -71.31)),
        (
            "https://www.google.com/maps/place/X/@-41.15,-71.31,17z/data=!3d-41.1512!4d-71.3112",
            (-41.1512, -71.3112),
        ),
        ("https://www.google.com/maps?q=-34.6037,-58.3816", (-34.6037, -58.3816)),
        ("https://maps.google.com/?ll=-34.6,-58.38&z=10", (-34.6, -58.38)),
        ("https://www.google.com.ar/maps/search/?api=1&query=-34.6,-58.4", None),
        ("https://example.com/@-41.15,-71.31", None),
        ("https://www.google.com/maps/place/Bariloche", None),
        ("https://www.google.com/maps?q=999,999", None),
    ],
)
def test_maps_coordinates(url, expected):
    assert parse_maps_coordinates(url) == expected
