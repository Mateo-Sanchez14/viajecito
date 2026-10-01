import io
import json
from io import StringIO

from django.core.management import call_command
from PIL import Image

from linkpreview.adapters.static_fetcher import StaticLinkPreviewFetcher
from linkpreview.adapters.wiring import build_fetcher
from linkpreview.domain.preview import PreviewData
from linkpreview.management.commands import unfurl as unfurl_command


def test_known_hosts_get_their_canned_preview_and_a_thumbnail():
    preview = StaticLinkPreviewFetcher().unfurl("https://www.booking.com/hotel/x.html?aid=1")
    assert preview.fetch_status == "ok"
    assert preview.title.startswith("Cabañas del Sur")
    assert (str(preview.price_amount), preview.price_currency) == ("120.00", "USD")
    assert Image.open(io.BytesIO(preview.thumbnail)).format == "WEBP"


def test_unknown_hosts_degrade_to_a_slug_title():
    preview = StaticLinkPreviewFetcher().unfurl("https://unknown.example.org/mi-lugar-favorito")
    assert (preview.fetch_status, preview.title, preview.thumbnail) == (
        "partial",
        "mi lugar favorito",
        None,
    )


def test_the_fetcher_setting_selects_the_adapter(settings):
    settings.LINKPREVIEW_FETCHER = "static"
    assert isinstance(build_fetcher(), StaticLinkPreviewFetcher)
    settings.LINKPREVIEW_FETCHER = "httpx"
    assert type(build_fetcher()).__name__ == "HttpxLinkPreviewFetcher"
    settings.LINKPREVIEW_FETCHER = "fake"
    assert type(build_fetcher()).__name__ == "FakeFetcher"


def test_unfurl_command_prints_the_parsed_preview(monkeypatch):
    class Canned:
        def unfurl(self, url):
            return PreviewData(url=url, title="Hola", thumbnail=b"abc", fetch_status="ok")

    monkeypatch.setattr(unfurl_command, "build_real_fetcher", lambda: Canned())
    out = StringIO()
    call_command("unfurl", "https://example.com/x", stdout=out)
    printed = json.loads(out.getvalue())
    assert printed["title"] == "Hola"
    assert printed["thumbnail_bytes"] == 3
