"""A deterministic in-memory fetcher (``LINKPREVIEW_FETCHER=fake``) for tests: no network."""

from linkpreview.domain.preview import PreviewData
from linkpreview.domain.urls import host_of, slug_title


class FakeFetcher:
    """Answers from a class-level registry; unknown URLs get a plain ``ok`` preview."""

    previews: dict[str, PreviewData] = {}
    calls: list[str] = []

    @classmethod
    def register(cls, url: str, preview: PreviewData) -> None:
        cls.previews[url] = preview

    @classmethod
    def reset(cls) -> None:
        cls.previews = {}
        cls.calls = []

    def unfurl(self, url: str) -> PreviewData:
        type(self).calls.append(url)
        found = type(self).previews.get(url)
        if found is not None:
            return found
        return PreviewData(
            url=url,
            final_url=url,
            title=slug_title(url),
            site_name=host_of(url),
            fetch_status="ok",
        )
