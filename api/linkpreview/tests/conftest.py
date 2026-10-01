import pytest

from linkpreview.adapters.fake_fetcher import FakeFetcher


@pytest.fixture(autouse=True)
def linkpreview_settings(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"


@pytest.fixture
def fake():
    FakeFetcher.reset()
    yield FakeFetcher
    FakeFetcher.reset()
