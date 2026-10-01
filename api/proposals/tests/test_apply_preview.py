from decimal import Decimal

import pytest

from linkpreview.models import LinkPreview
from proposals.adapters import previews
from proposals.adapters.preview_events import on_preview_fetched
from proposals.models import Proposal

pytestmark = pytest.mark.django_db

URL = "https://www.booking.com/hotel/ar/cabanas-del-sur.html"


@pytest.fixture
def preview():
    return LinkPreview.objects.create(
        url=URL,
        canonical_url="https://booking.com/hotel/ar/cabanas-del-sur.html",
        title="Cabañas del Sur, San Martín",
        site_name="Booking.com",
        description="Con cocina",
        price_amount=Decimal("120.00"),
        price_currency="USD",
        fetch_status="ok",
    )


def fire(preview):
    on_preview_fetched(
        preview_id=str(preview.pk), canonical_url=preview.canonical_url, fetch_status="ok"
    )


def test_a_placeholder_title_price_and_category_are_filled_in(make_proposal, preview):
    proposal = make_proposal(
        title="cabanas del sur",
        category="other",
        classified_by="rules",
        link_preview=preview,
        currency="ARS",
    )
    fire(preview)
    proposal.refresh_from_db()
    assert proposal.title == "Cabañas del Sur, San Martín"
    assert (proposal.est_price, proposal.currency) == (Decimal("120.00"), "USD")
    assert (proposal.category, proposal.classified_by) == ("lodging", "rules")


def test_what_a_person_typed_is_never_overwritten(make_proposal, preview):
    proposal = make_proposal(
        title="Nuestra cabaña",
        category="activity",
        classified_by="user",
        est_price=Decimal("50.00"),
        currency="ARS",
        link_preview=preview,
    )
    fire(preview)
    proposal.refresh_from_db()
    assert (proposal.title, proposal.category, proposal.est_price, proposal.currency) == (
        "Nuestra cabaña",
        "activity",
        Decimal("50.00"),
        "ARS",
    )


def test_failed_or_blocked_previews_change_nothing(make_proposal, preview):
    proposal = make_proposal(title="cabanas del sur", classified_by="rules", link_preview=preview)
    for status in ("blocked", "failed", "pending"):
        LinkPreview.objects.filter(pk=preview.pk).update(fetch_status=status)
        fire(preview)
    proposal.refresh_from_db()
    assert proposal.title == "cabanas del sur"


def test_an_inconclusive_reclassification_keeps_the_category(make_proposal, preview):
    LinkPreview.objects.filter(pk=preview.pk).update(
        url="https://unknown.example.org/x", title="Algo", price_amount=None
    )
    proposal = make_proposal(
        category="food", classified_by="rules", title="x", link_preview=preview
    )
    fire(preview)
    proposal.refresh_from_db()
    assert proposal.category == "food"


def test_unknown_previews_and_unrelated_proposals_are_ignored(make_proposal, preview):
    other = make_proposal(title="cabanas del sur", classified_by="rules")
    on_preview_fetched(
        preview_id="00000000-0000-0000-0000-000000000000", canonical_url="x", fetch_status="ok"
    )
    fire(preview)
    other.refresh_from_db()
    assert other.title == "cabanas del sur"
    assert Proposal.objects.count() == 1


def test_the_bridge_maps_the_preview_without_exposing_models(preview):
    summary = previews.fetched(str(preview.pk))
    assert (summary.title, summary.fetch_status, summary.has_thumbnail) == (
        "Cabañas del Sur, San Martín",
        "ok",
        False,
    )
    assert previews.fetched("00000000-0000-0000-0000-000000000000") is None
