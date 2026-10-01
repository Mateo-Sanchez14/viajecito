"""Resolving, caching, refreshing and retrying previews (fake fetcher, real database)."""

import io
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import time_machine
from PIL import Image

from linkpreview.adapters.executor import schedule_fetch
from linkpreview.domain.preview import PreviewData
from linkpreview.models import LinkPreview
from linkpreview.use_cases.prepare_preview import prepare_preview
from linkpreview.use_cases.refresh_preview import RefreshTooSoonError, refresh_preview
from linkpreview.use_cases.resolve_preview import resolve_preview
from linkpreview.use_cases.retry_pending import retry_pending
from shared import events

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 3, 1, 15, 0, tzinfo=UTC)
URL = "https://www.booking.com/hotel/ar/cabanas.html"


def thumb_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (640, 360), "red").save(buffer, "WEBP")
    return buffer.getvalue()


def ok_preview(url=URL, **overrides) -> PreviewData:
    values = {
        "url": url,
        "final_url": url,
        "title": "Cabañas del Sur",
        "site_name": "Booking.com",
        "description": "Lindas",
        "image_url": "https://cdn.example.net/x.jpg",
        "price_amount": Decimal("120.00"),
        "price_currency": "USD",
        "fetch_status": "ok",
        "raw": {"og:title": "Cabañas del Sur"},
        "thumbnail": thumb_bytes(),
    }
    return PreviewData(**{**values, **overrides})


@time_machine.travel(NOW, tick=False)
def test_resolving_a_new_url_fetches_and_stores_the_preview(fake):
    fake.register(URL, ok_preview())
    ref = resolve_preview(URL)
    assert ref.fetch_status == "ok"
    assert ref.canonical_url == "https://booking.com/hotel/ar/cabanas.html"
    assert (ref.title, ref.site_name, ref.price_amount, ref.price_currency) == (
        "Cabañas del Sur",
        "Booking.com",
        Decimal("120.00"),
        "USD",
    )
    assert ref.has_thumbnail
    assert ref.fetched_at == NOW
    assert ref.fetch_attempts == 1
    row = LinkPreview.objects.get()
    assert row.raw == {"og:title": "Cabañas del Sur"}


def test_a_fresh_preview_is_reused_for_seven_days(fake):
    with time_machine.travel(NOW, tick=False):
        first = resolve_preview(URL)
    with time_machine.travel(NOW + timedelta(days=6), tick=False):
        assert resolve_preview(URL).id == first.id
    assert fake.calls == [URL]
    with time_machine.travel(NOW + timedelta(days=8), tick=False):
        again = resolve_preview(URL)
    assert again.id == first.id
    assert fake.calls == [URL, URL]
    assert again.fetch_attempts == 2


def test_tracking_variants_of_one_page_share_a_row(fake):
    resolve_preview("https://www.booking.com/hotel/ar/cabanas.html?utm_source=a&b=1&a=2")
    resolve_preview("https://booking.com/hotel/ar/cabanas.html?fbclid=1&a=2&b=1#x")
    assert LinkPreview.objects.count() == 1
    resolve_preview("http://booking.com/hotel/ar/cabanas.html?a=2&b=1")
    assert LinkPreview.objects.count() == 2  # the scheme is part of the canonical form


@pytest.mark.parametrize("status", ["failed", "blocked"])
def test_unusable_previews_are_fetched_again(fake, status):
    fake.register(URL, PreviewData(url=URL, title="slug", fetch_status=status, fetch_error="x"))
    resolve_preview(URL)
    fake.register(URL, ok_preview())
    assert resolve_preview(URL).fetch_status == "ok"
    assert fake.calls == [URL, URL]


def test_force_refetches_a_fresh_preview(fake):
    resolve_preview(URL)
    resolve_preview(URL, force=True)
    assert len(fake.calls) == 2


def test_maps_short_links_are_canonicalized_after_the_redirect(fake):
    short = "https://maps.app.goo.gl/AbC123"
    final = "https://www.google.com/maps/place/Refugio/@-41.15,-71.31,17z?entry=tts"
    fake.register(short, ok_preview(short, final_url=final, lat=-41.15, lng=-71.31))
    ref = resolve_preview(short)
    assert ref.canonical_url == "https://google.com/maps/place/Refugio/@-41.15,-71.31,17z?entry=tts"
    assert (ref.lat, ref.lng) == (-41.15, -71.31)
    assert resolve_preview(short).id == ref.id  # found by its first-seen URL, no second fetch
    assert fake.calls == [short]


def test_a_second_short_link_to_the_same_place_returns_the_existing_row(fake):
    final = "https://www.google.com/maps/place/Refugio/@-41.15,-71.31,17z"
    fake.register(
        "https://maps.app.goo.gl/one", ok_preview("https://maps.app.goo.gl/one", final_url=final)
    )
    fake.register(
        "https://maps.app.goo.gl/two", ok_preview("https://maps.app.goo.gl/two", final_url=final)
    )
    first = resolve_preview("https://maps.app.goo.gl/one")
    second = resolve_preview("https://maps.app.goo.gl/two")
    assert second.id == first.id
    assert second.canonical_url == first.canonical_url


def test_thumbnails_get_random_webp_names_and_old_ones_are_deleted(fake, settings):
    fake.register(URL, ok_preview())
    resolve_preview(URL)
    first = LinkPreview.objects.get().thumb_file
    assert first.name.startswith("linkpreview/thumbs/") and first.name.endswith(".webp")
    first_path = first.path
    fake.register(URL, ok_preview())
    resolve_preview(URL, force=True)
    second = LinkPreview.objects.get().thumb_file
    assert second.name != first.name
    import os

    assert not os.path.exists(first_path)
    assert os.path.exists(second.path)


def test_a_refetch_without_a_thumbnail_keeps_the_old_one(fake):
    fake.register(URL, ok_preview())
    resolve_preview(URL)
    fake.register(URL, ok_preview(thumbnail=None))
    resolve_preview(URL, force=True)
    assert LinkPreview.objects.get().thumb_file


def test_fetch_results_publish_an_event_after_commit(fake, django_capture_on_commit_callbacks):
    seen = []
    with events.isolated():
        events.subscribe("linkpreview.preview_fetched", lambda **payload: seen.append(payload))
        with django_capture_on_commit_callbacks(execute=True):
            ref = resolve_preview(URL)
    assert seen == [
        {
            "preview_id": ref.id,
            "canonical_url": ref.canonical_url,
            "fetch_status": "ok",
        }
    ]


# --- web path: pending first, fetch off the request ------------------------------------------


def test_prepare_creates_a_pending_row_and_asks_for_a_fetch(fake):
    result = prepare_preview(URL)
    assert result.needs_fetch
    assert result.ref.fetch_status == "pending"
    assert result.ref.title == ""
    assert fake.calls == []


def test_prepare_reuses_a_fresh_preview_without_a_fetch(fake):
    resolve_preview(URL)
    result = prepare_preview(URL)
    assert not result.needs_fetch
    assert result.ref.fetch_status == "ok"


def test_sync_scheduler_runs_the_fetch_inline(fake):
    result = prepare_preview(URL)
    schedule_fetch(result.ref.id)
    assert LinkPreview.objects.get(pk=result.ref.id).fetch_status == "ok"


def test_async_scheduler_defers_to_the_executor_after_commit(
    fake, settings, django_capture_on_commit_callbacks, monkeypatch
):
    settings.LINKPREVIEW_FETCH_SYNC = False
    submitted = []
    from linkpreview.adapters import executor

    monkeypatch.setattr(executor._executor, "submit", lambda fn, *args: submitted.append(args))
    result = prepare_preview(URL)
    with django_capture_on_commit_callbacks(execute=True):
        schedule_fetch(result.ref.id)
        assert submitted == []  # nothing before the commit
    assert submitted == [(result.ref.id,)]


# --- manual refresh -------------------------------------------------------------------------


def test_refresh_requeues_a_settled_preview_once_per_ten_minutes(fake):
    with time_machine.travel(NOW, tick=False):
        ref = resolve_preview(URL)
    with time_machine.travel(NOW + timedelta(minutes=5), tick=False):
        with pytest.raises(RefreshTooSoonError):
            refresh_preview(ref.id)
    with time_machine.travel(NOW + timedelta(minutes=11), tick=False):
        refresh_preview(ref.id)
    assert len(fake.calls) == 2
    assert LinkPreview.objects.get().fetch_attempts == 2


def test_refresh_is_refused_while_a_fetch_is_pending(fake):
    ref = prepare_preview(URL).ref
    with pytest.raises(RefreshTooSoonError):
        refresh_preview(ref.id)


# --- tick job --------------------------------------------------------------------------------


def make_row(canonical, status, attempts, age: timedelta):
    row = LinkPreview.objects.create(
        url=canonical, canonical_url=canonical, fetch_status=status, fetch_attempts=attempts
    )
    LinkPreview.objects.filter(pk=row.pk).update(updated_at=NOW - age)
    return row


def test_retry_picks_stuck_pending_and_old_failed_previews(fake):
    stuck = make_row("https://a.example/stuck", "pending", 0, timedelta(minutes=3))
    failed = make_row("https://a.example/failed", "failed", 1, timedelta(minutes=20))
    make_row("https://a.example/young-pending", "pending", 0, timedelta(minutes=1))
    make_row("https://a.example/young-failed", "failed", 1, timedelta(minutes=5))
    make_row("https://a.example/exhausted", "failed", 3, timedelta(hours=3))
    make_row("https://a.example/blocked", "blocked", 1, timedelta(hours=3))
    make_row("https://a.example/ok", "ok", 1, timedelta(hours=3))
    with time_machine.travel(NOW, tick=False):
        summary = retry_pending(NOW)
    assert sorted(fake.calls) == sorted([stuck.url, failed.url])
    assert summary == {"retried": 2}


def test_retry_handles_at_most_three_per_tick_oldest_first(fake):
    rows = [
        make_row(f"https://a.example/p{i}", "pending", 0, timedelta(minutes=10 + i))
        for i in range(5)
    ]
    with time_machine.travel(NOW, tick=False):
        retry_pending(NOW)
    assert fake.calls == [rows[4].url, rows[3].url, rows[2].url]


def test_retry_counts_the_attempt_and_can_still_fail(fake):
    row = make_row("https://a.example/f", "failed", 2, timedelta(minutes=30))
    fake.register(
        row.url, PreviewData(url=row.url, title="t", fetch_status="failed", fetch_error="timeout")
    )
    with time_machine.travel(NOW, tick=False):
        retry_pending(NOW)
    row.refresh_from_db()
    assert (row.fetch_status, row.fetch_attempts, row.fetch_error) == ("failed", 3, "timeout")
    with time_machine.travel(NOW + timedelta(hours=1), tick=False):
        assert retry_pending(NOW + timedelta(hours=1)) == {"retried": 0}


# --- a failing fetcher can never wedge the retry job -------------------------------------------


class Exploding:
    def __init__(self, bad=()):
        self.bad, self.calls = set(bad), []

    def unfurl(self, url):
        self.calls.append(url)
        if url in self.bad:
            raise RecursionError("poison")
        return ok_preview(url)


def test_a_raising_fetcher_records_a_failed_attempt(fake):
    from linkpreview.use_cases.fetch_preview import fetch_preview

    row = make_row("https://a.example/poison", "pending", 0, timedelta(minutes=5))
    with time_machine.travel(NOW, tick=False):
        ref = fetch_preview(str(row.pk), fetcher=Exploding({row.url}))
    row.refresh_from_db()
    assert (row.fetch_status, row.fetch_attempts, ref.fetch_status) == ("failed", 1, "failed")
    assert row.fetch_error == "fetch_error"
    assert row.updated_at == NOW


def test_three_poison_rows_do_not_starve_the_retry_job(fake, monkeypatch):
    from linkpreview import ports

    poison = [
        make_row(f"https://a.example/poison{i}", "pending", 0, timedelta(hours=1, minutes=i))
        for i in range(3)
    ]
    healthy = make_row("https://a.example/healthy", "pending", 0, timedelta(minutes=10))
    exploding = Exploding({r.url for r in poison})
    monkeypatch.setattr(ports, "_default_fetcher", lambda: exploding)
    with time_machine.travel(NOW, tick=False):
        assert retry_pending(NOW) == {"retried": 3}
        assert (
            LinkPreview.objects.filter(pk__in=[r.pk for r in poison], fetch_attempts=1).count() == 3
        )
        assert retry_pending(NOW + timedelta(minutes=1)) == {"retried": 1}
    healthy.refresh_from_db()
    assert healthy.fetch_status == "ok"


def test_marking_pending_bumps_updated_at(fake):
    from linkpreview.adapters.django_store import DjangoPreviewStore

    row = make_row("https://a.example/m", "ok", 1, timedelta(days=2))
    with time_machine.travel(NOW, tick=False):
        DjangoPreviewStore().mark_pending(str(row.pk))
    row.refresh_from_db()
    assert (row.fetch_status, row.updated_at) == ("pending", NOW)


def test_retry_stops_when_the_tick_deadline_is_near(fake):
    for i in range(3):
        make_row(f"https://a.example/d{i}", "pending", 0, timedelta(minutes=10 + i))
    calls = iter([True])
    with time_machine.travel(NOW, tick=False):
        summary = retry_pending(NOW, out_of_time=lambda: next(calls))
    assert summary == {"retried": 1}
