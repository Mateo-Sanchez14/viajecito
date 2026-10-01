import pytest

from linkpreview.domain.preview import PreviewData
from proposals.bot import link_capture
from proposals.models import Proposal, Vote
from proposals.tests.handler_context import Recorder, make_ctx

pytestmark = pytest.mark.django_db

A, B, C = (f"https://{host}/x" for host in ("a.example.com", "b.example.com", "c.example.com"))


def run(body, person, crew, **kwargs):
    recorder = Recorder(**kwargs)
    handled = link_capture.handle(make_ctx(body, person, crew, recorder))
    return handled, recorder


def test_messages_without_a_proposal_url_are_not_claimed(trip, ana, crew):
    for body in (
        "hola",
        "https://wa.me/5491155551111",
        "https://chat.whatsapp.com/abc",
        "https://viajecito.example.com/crews/x",
    ):
        handled, recorder = run(body, ana, crew)
        assert handled is None and recorder.replies == [] and recorder.cards == []
    assert Proposal.objects.count() == 0


def test_the_crews_gastito_host_is_ignored(trip, ana, crew):
    crew.gastito_group_url = "https://gastito.example.org/g/abc"
    crew.save()
    handled, _ = run("https://gastito.example.org/gasto/1", ana, crew)
    assert handled is None


def test_without_a_default_trip_the_bot_asks_to_create_one(ana, crew):
    handled, recorder = run(f"mirá {A}", ana, crew)
    assert handled.handler == "link_capture" and handled.detail["reason"] == "no_trip"
    assert recorder.replies == [
        (
            "Todavía no hay un viaje activo. Creá uno en https://viajecito.example.com "
            "y volvé a tirar el link."
        )
    ]
    assert Proposal.objects.count() == 0


def test_several_links_create_one_proposal_and_card_each(trip, ana, crew):
    handled, recorder = run(f"{A} {B} {C} los tres", ana, crew)
    proposals = list(Proposal.objects.order_by("created_at"))
    assert len(proposals) == 3
    assert handled.detail["created"] == [str(p.pk) for p in proposals]
    assert [c["dedupe_key"] for c in recorder.cards] == [f"card:proposal:{p.pk}" for p in proposals]
    assert all(p.note == "los tres" for p in proposals)
    assert recorder.replies == []


def test_more_than_three_links_save_three_and_say_so(trip, ana, crew):
    urls = " ".join(f"https://s{i}.example.com/x" for i in range(5))
    handled, recorder = run(urls, ana, crew)
    assert Proposal.objects.count() == 3
    assert recorder.replies == ["Guardé los primeros 3 links; el resto mandalo de a poco."]
    assert handled.detail["ignored_urls"] == 2


def test_existing_and_new_links_in_one_message_get_a_single_reply(trip, ana, beto, crew):
    run(A, ana, crew)
    handled, recorder = run(f"{A} {B}", beto, crew)
    assert Proposal.objects.count() == 2
    assert len(recorder.cards) == 1
    assert recorder.replies == ["Ya estaba 👀 (la propuso Ana). Te sumé un +1."]
    assert len(handled.detail["existing"]) == 1 and len(handled.detail["created"]) == 1


def test_a_second_message_from_someone_who_already_voted_does_not_claim_a_plus_one(
    trip, ana, beto, crew
):
    run(A, ana, crew)
    run(A, beto, crew)
    _, recorder = run(A, beto, crew)
    assert recorder.replies == ["Ya estaba 👀 (la propuso Ana)."]
    assert Vote.objects.count() == 1


def test_text_with_an_existing_link_becomes_a_comment(trip, ana, beto, crew):
    run(A, ana, crew)
    run(f"{A} ¿y el precio?", beto, crew)
    comment = Proposal.objects.get().comments.get()
    assert (comment.body, comment.author_id) == ("¿y el precio?", beto.pk)


def test_a_throttled_chat_records_the_proposal_but_sends_no_reply(trip, ana, beto, crew):
    run(A, ana, crew)
    handled, recorder = run(f"{A} {B}", beto, crew, allowed=False)
    assert recorder.replies == []
    assert handled.detail["reply"] == "throttled"
    assert Proposal.objects.count() == 2
    assert Vote.objects.count() == 1  # the +1 was recorded anyway


def test_a_failed_card_does_not_lose_the_proposal(trip, ana, crew):
    handled, recorder = run(A, ana, crew, card_status="failed")
    assert Proposal.objects.count() == 1
    assert handled.detail["created"] == [str(Proposal.objects.get().pk)]
    assert handled.detail["cards"] == {"sent": 0, "failed": 1}


def test_blocked_and_failed_unfurls_are_still_proposals(trip, ana, crew, fake):
    fake.register(A, PreviewData(url=A, title="x", fetch_status="failed", fetch_error="timeout"))
    handled, recorder = run(A, ana, crew)
    assert Proposal.objects.get().link_preview.fetch_status == "failed"
    assert len(recorder.cards) == 1


def test_one_broken_link_does_not_stop_the_others(trip, ana, crew, monkeypatch):
    real = link_capture.capture_link

    def flaky(store, **kwargs):
        if kwargs["url"] == A:
            raise RuntimeError("boom")
        return real(store, **kwargs)

    monkeypatch.setattr(link_capture, "capture_link", flaky)
    handled, recorder = run(f"{A} {B}", ana, crew)
    assert Proposal.objects.count() == 1
    assert handled.detail["errors"] == 1
    assert len(recorder.cards) == 1


def test_the_card_never_leaks_the_source_query_string(trip, ana, crew):
    _, recorder = run("https://a.example.com/x?utm_source=wa&fbclid=1&id=7", ana, crew)
    body = recorder.cards[0]["body"]
    assert "fbclid" not in body and "utm_source" not in body and "id=7" not in body
