import json
from dataclasses import asdict

from django.core.management.base import BaseCommand

from linkpreview.adapters.httpx_fetcher import HttpxLinkPreviewFetcher


def build_real_fetcher() -> HttpxLinkPreviewFetcher:
    return HttpxLinkPreviewFetcher()


class Command(BaseCommand):
    help = "Dev diagnostic: unfurl a URL with the real SSRF-guarded fetcher and print the preview."

    def add_arguments(self, parser):
        parser.add_argument("url")

    def handle(self, *args, **options):
        preview = build_real_fetcher().unfurl(options["url"])
        data = asdict(preview)
        data["thumbnail_bytes"] = len(data.pop("thumbnail") or b"")
        data["price_amount"] = str(data["price_amount"]) if data["price_amount"] else None
        self.stdout.write(json.dumps(data, ensure_ascii=False, indent=2, default=str))
