from decimal import Decimal
from pathlib import Path

from linkpreview.adapters.html_parser import parse_page
from linkpreview.domain.preview import PreviewData, blocked_preview, finalize

HTML = Path(__file__).parent / "fixtures" / "html"


def page(name: str, url: str):
    return parse_page((HTML / name).read_bytes(), url)


def test_booking_open_graph_meta():
    meta = page("booking.html", "https://www.booking.com/hotel/ar/cabanas-del-sur.html")
    assert meta.title == "Cabañas del Sur, San Martín de los Andes"
    assert meta.description.startswith("Cabañas del Sur ofrece alojamiento")
    assert meta.image_url == "https://cf.bstatic.com/xdata/images/hotel/max1024x768/123.jpg?k=abc"
    assert meta.site_name == "Booking.com"
    assert meta.price_amount is None


def test_airbnb_relative_image_is_resolved_and_og_price_is_read():
    meta = page("airbnb.html", "https://www.airbnb.com.ar/rooms/1")
    assert meta.title == "Depto con vista al lago - Departamentos en alquiler en Bariloche"
    assert meta.description.startswith("Departamento entero con vista al lago")
    assert meta.image_url == "https://www.airbnb.com.ar/images/airbnb-hero.jpg"
    assert meta.site_name == "Airbnb"
    assert (meta.price_amount, meta.price_currency) == (Decimal("185.50"), "USD")


def test_plain_page_falls_back_to_title_tag_and_meta_description():
    meta = page("plain.html", "https://www.termas.cl/puyehue")
    assert meta.title == "Termas de Puyehue información"
    assert meta.description == "Termas y spa en el sur de Chile."
    assert meta.image_url == ""
    assert meta.site_name == "termas.cl"


def test_json_ld_aggregate_offer_gives_the_low_price_and_bad_json_is_skipped():
    meta = page("jsonld_offer.html", "https://catedral.example/pase")
    assert (meta.price_amount, meta.price_currency) == (Decimal("98000.00"), "ARS")
    assert meta.title == "Pase de 3 días Cerro Catedral"


def test_product_price_meta_and_unparseable_og_price_is_ignored():
    meta = page("product_price.html", "https://shop.example/botas")
    assert (meta.price_amount, meta.price_currency) == (Decimal("45000"), "ARS")


def test_hotel_price_range_is_ignored_but_geo_is_read():
    meta = page("hotel_pricerange.html", "https://hotel.example/refugio")
    assert meta.price_amount is None
    assert (meta.lat, meta.lng) == (-41.1335, -71.3103)


def test_place_location_meta_gives_coordinates():
    meta = page("maps_place.html", "https://www.google.com/maps/place/Refugio+Frey")
    assert (meta.lat, meta.lng) == (-41.2044, -71.4509)
    assert meta.title == "Refugio Frey"


def test_coordinates_come_from_the_maps_url_when_the_page_has_none():
    meta = page("plain.html", "https://www.google.com/maps/place/X/@-41.15,-71.31,17z")
    assert (meta.lat, meta.lng) == (-41.15, -71.31)


def test_control_characters_are_stripped_and_fields_truncated():
    html = (
        '<meta property="og:title" content="Hola\x00\x07 mundo‮">'
        f'<meta property="og:description" content="{"x" * 2000}">'
    )
    meta = parse_page(html, "https://a.example/x")
    assert meta.title == "Hola mundo"
    assert len(meta.description) == 1000


def test_raw_keeps_extracted_meta_only_and_is_capped():
    meta = page("booking.html", "https://www.booking.com/h")
    assert "<html" not in str(meta.raw)
    huge = "".join(f'<meta property="og:x{i}" content="{"y" * 500}">' for i in range(200))
    assert len(str(parse_page(huge, "https://a.example/").raw)) <= 32_768


def test_empty_and_garbage_input_do_not_raise():
    assert parse_page(b"", "https://a.example/").title == ""
    assert parse_page(b"\xff\xfe<<<>>>", "https://a.example/").title == ""


# --- slug fallback for pages we cannot read ---------------------------------------------------


def test_blocked_pages_get_a_slug_title_and_stay_blocked():
    preview = blocked_preview(
        "https://www.booking.com/hotel/ar/cabanas-del-sur.html?x=1", "http_403"
    )
    assert preview.fetch_status == "blocked"
    assert preview.fetch_error == "http_403"
    assert preview.title == "cabanas del sur"


def test_finalize_marks_pages_without_title_or_image_as_partial():
    meta = parse_page(b"<html><body>hi</body></html>", "https://a.example/mi-pagina")
    preview = finalize("https://a.example/mi-pagina", "https://a.example/mi-pagina", meta)
    assert preview.fetch_status == "partial"
    assert preview.title == "mi pagina"


def test_finalize_marks_pages_with_a_title_as_ok_and_keeps_the_coordinates():
    meta = page("maps_place.html", "https://www.google.com/maps/place/Refugio+Frey")
    preview = finalize(
        "https://maps.app.goo.gl/abc", "https://www.google.com/maps/place/Refugio+Frey", meta
    )
    assert isinstance(preview, PreviewData)
    assert preview.fetch_status == "ok"
    assert preview.final_url == "https://www.google.com/maps/place/Refugio+Frey"
    assert (preview.lat, preview.lng) == (-41.2044, -71.4509)


def test_challenge_pages_are_treated_as_blocked():
    meta = page("challenge.html", "https://www.booking.com/hotel/x.html")
    preview = finalize(
        "https://www.booking.com/hotel/x.html", "https://www.booking.com/hotel/x.html", meta
    )
    assert preview.fetch_status == "blocked"
    assert preview.fetch_error == "challenge_page"
    assert preview.title == "x"
