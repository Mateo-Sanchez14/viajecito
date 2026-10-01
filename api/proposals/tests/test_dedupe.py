"""Link capture on the use-case level: create, dedupe, replay (fake fetcher, real database)."""

from decimal import Decimal

import pytest

from linkpreview.domain.preview import PreviewData
from messaging.models import InboundMessage
from proposals.adapters import previews
from proposals.domain.classifier import RuleBasedClassifier
from proposals.models import Comment, Proposal, Vote
from proposals.use_cases.capture_link import capture_link

pytestmark = pytest.mark.django_db

URL = "https://www.booking.com/hotel/ar/cabanas-del-sur.html"


@pytest.fixture
def capture(store, trip):
    def run(person, url=URL, note="", message=None, **kwargs):
        return capture_link(
            store,
            trip_id=str(trip.pk),
            person_id=str(person.pk),
            source_message_id=message.pk if message else None,
            url=url,
            note=note,
            resolve_preview=previews.resolve,
            classifier=RuleBasedClassifier(),
            **kwargs,
        )

    return run


def inbound(gowa_id="m1"):
    return InboundMessage.objects.create(
        device_id="d", gowa_message_id=gowa_id, event="message", chat_id="c@g.us"
    )


def test_a_new_link_becomes_a_proposed_proposal_with_its_preview(capture, ana, trip, fake):
    fake.register(
        URL,
        PreviewData(
            url=URL,
            final_url=URL,
            title="Cabañas del Sur",
            site_name="Booking.com",
            description="Cabañas lindas",
            price_amount=Decimal("120.00"),
            price_currency="USD",
            fetch_status="ok",
        ),
    )
    message = inbound()
    result = capture(ana, note="¿Les copa?", message=message)
    assert result.kind == "created"
    proposal = Proposal.objects.get()
    assert (proposal.trip_id, proposal.author_id, proposal.status) == (trip.pk, ana.pk, "proposed")
    assert proposal.title == "Cabañas del Sur"
    assert proposal.category == "lodging"
    assert proposal.classified_by == "rules"
    assert proposal.note == "¿Les copa?"
    assert proposal.canonical_url == "https://booking.com/hotel/ar/cabanas-del-sur.html"
    assert proposal.source_message_id == message.pk
    assert proposal.link_preview.fetch_status == "ok"
    assert (str(proposal.est_price), proposal.currency) == ("120.00", "USD")


def test_without_a_price_the_trip_currency_is_used(capture, ana):
    capture(ana)
    proposal = Proposal.objects.get()
    assert (proposal.est_price, proposal.currency) == (None, "ARS")


def test_blocked_pages_still_create_a_proposal_with_a_slug_title(capture, ana, fake):
    fake.register(
        URL,
        PreviewData(
            url=URL, title="cabanas del sur", fetch_status="blocked", fetch_error="http_403"
        ),
    )
    capture(ana)
    proposal = Proposal.objects.get()
    assert proposal.title == "cabanas del sur"
    assert proposal.link_preview.fetch_status == "blocked"
    assert proposal.category == "lodging"  # the host table still classifies it


def test_the_same_canonical_url_again_adds_a_plus_one_and_a_comment(capture, ana, beto):
    capture(ana)
    result = capture(
        beto,
        url="https://booking.com/hotel/ar/cabanas-del-sur.html?utm_source=wa#reviews",
        note="Yo voy",
    )
    assert result.kind == "existing"
    assert result.voted and result.commented
    assert Proposal.objects.count() == 1
    vote = Vote.objects.get()
    assert (vote.person_id, vote.value) == (beto.pk, 1)
    assert Comment.objects.get().body == "Yo voy"
    assert Proposal.objects.get().status == "discussing"  # the +1 started the discussion


def test_a_second_link_from_someone_who_already_voted_does_not_vote_again(capture, ana, beto):
    capture(ana)
    capture(beto)
    Vote.objects.filter(person=beto).update(value=-1)
    result = capture(beto)
    assert not result.voted
    assert Vote.objects.get().value == -1


def test_without_text_no_comment_is_added(capture, ana, beto):
    capture(ana)
    result = capture(beto)
    assert not result.commented
    assert Comment.objects.count() == 0


def test_the_same_url_in_another_trip_is_a_new_proposal(capture, ana, crew, store, trip):
    from trips.models import Trip

    capture(ana)
    other = Trip.objects.create(crew=crew, name="Mendoza")
    result = capture_link(
        store,
        trip_id=str(other.pk),
        person_id=str(ana.pk),
        source_message_id=None,
        url=URL,
        note="",
        resolve_preview=previews.resolve,
        classifier=RuleBasedClassifier(),
    )
    assert result.kind == "created"
    assert Proposal.objects.count() == 2


def test_replaying_the_same_inbound_message_never_duplicates_or_self_votes(capture, ana):
    message = inbound()
    first = capture(ana, message=message)
    again = capture(ana, message=message)
    assert (first.kind, again.kind) == ("created", "replay")
    assert again.proposal.id == first.proposal.id
    assert Proposal.objects.count() == 1
    assert Vote.objects.count() == 0


def test_a_discarded_proposal_is_not_revived_and_takes_no_vote(capture, ana, beto):
    capture(ana)
    Proposal.objects.update(status="discarded")
    result = capture(beto)
    assert result.kind == "existing" and not result.voted
    assert Vote.objects.count() == 0


def test_maps_short_links_dedupe_after_the_redirect(capture, ana, beto, fake):
    short_one, short_two = "https://maps.app.goo.gl/one", "https://maps.app.goo.gl/two"
    final = "https://www.google.com/maps/place/Refugio+Frey/@-41.2,-71.4,17z"
    for short in (short_one, short_two):
        fake.register(
            short,
            PreviewData(
                url=short,
                final_url=final,
                title="Refugio Frey",
                lat=-41.2,
                lng=-71.4,
                fetch_status="ok",
            ),
        )
    capture(ana, url=short_one)
    result = capture(beto, url=short_two)
    assert result.kind == "existing"
    proposal = Proposal.objects.get()
    assert proposal.category == "lodging"  # "Refugio" in the name beats the maps destination rule
    assert proposal.link_preview.lat is not None


def test_maps_places_are_destinations(capture, ana, fake):
    url = "https://www.google.com/maps/place/Cerro+Otto/@-41.14,-71.3,17z"
    fake.register(
        url,
        PreviewData(
            url=url, final_url=url, title="Cerro Otto", lat=-41.14, lng=-71.3, fetch_status="ok"
        ),
    )
    capture(ana, url=url)
    assert Proposal.objects.get().category == "destination"


def test_an_unknown_trip_is_a_lookup_error(store, ana):
    with pytest.raises(LookupError):
        capture_link(
            store,
            trip_id="00000000-0000-0000-0000-000000000000",
            person_id=str(ana.pk),
            source_message_id=None,
            url=URL,
            note="",
            resolve_preview=previews.resolve,
            classifier=RuleBasedClassifier(),
        )
