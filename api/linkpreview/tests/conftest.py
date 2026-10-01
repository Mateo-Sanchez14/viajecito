import pytest

from linkpreview.adapters.fake_fetcher import FakeFetcher


@pytest.fixture(autouse=True)
def linkpreview_settings(settings, tmp_path):
    settings.LINKPREVIEW_FETCHER = "fake"
    settings.LINKPREVIEW_FETCH_SYNC = True
    settings.MEDIA_ROOT = tmp_path / "media"


@pytest.fixture
def fake():
    FakeFetcher.reset()
    yield FakeFetcher
    FakeFetcher.reset()
