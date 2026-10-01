import io
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import time_machine
from django.core.files.base import ContentFile
from django.test import Client
from PIL import Image

from crews.models import Crew, CrewMembership
from identity.models import Person
from linkpreview.domain.preview import PreviewData
from linkpreview.models import LinkPreview
from proposals.models import Comment, Proposal, Vote
from proposals.tests.conftest import send

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)
URL = "https://www.booking.com/hotel/ar/cabanas-del-sur.html"


@pytest.fixture
def stranger(db):
    other = Crew.objects.create(name="Los Otros")
    person = Person.objects.create_user("+5491100009999", display_name="Extra")
    CrewMembership.objects.create(crew=other, person=person, source="invite")
    return person


def list_url(trip):
    return f"/api/trips/{trip.pk}/proposals"


# --- authorization, on every route ------------------------------------------------------------


@pytest.fixture
def seeded(make_proposal, ana, beto):
    proposal = make_proposal(
        link_preview=LinkPreview.objects.create(
            url=URL, canonical_url="https://booking.com/x", fetch_status="ok", fetched_at=NOW
        )
    )
    comment = Comment.objects.create(proposal=proposal, author=beto, body="hola")
    return proposal, comment


def routes(trip, proposal, comment):
    p = f"/api/proposals/{proposal.pk}"
    return [
        ("get", list_url(trip), None),
        ("get", f"{list_url(trip)}/summary", None),
        ("post", list_url(trip), {"title": "Algo"}),
        ("get", p, None),
        ("patch", p, {"title": "Otro"}),
        ("post", f"{p}/transition", {"to": "chosen"}),
        ("put", f"{p}/vote", {"value": 1}),
        ("delete", f"{p}/vote", None),
        ("get", f"{p}/comments", None),
        ("post", f"{p}/comments", {"body": "hola"}),
        ("delete", f"/api/comments/{comment.pk}", None),
        ("post", f"{p}/refresh_preview", None),
        ("get", f"{p}/thumbnail", None),
    ]


def test_non_members_get_404_on_every_route(as_person, stranger, trip, seeded):
    client = as_person(stranger)
    for method, path, payload in routes(trip, *seeded):
        response = send(client, method, path, payload)
        assert response.status_code == 404, (method, path)
        assert response.json()["code"] == "not_found", (method, path)
    assert Proposal.objects.count() == 1 and Comment.objects.count() == 1


def test_unknown_ids_look_exactly_like_non_member_ids(as_person, ana):
    client = as_person(ana)
    ghost = "00000000-0000-0000-0000-000000000000"
    for method, path, payload in [
        ("get", f"/api/proposals/{ghost}", None),
        ("post", f"/api/proposals/{ghost}/transition", {"to": "chosen"}),
        ("put", f"/api/proposals/{ghost}/vote", {"value": 1}),
        ("get", f"/api/proposals/{ghost}/comments", None),
        ("delete", f"/api/comments/{ghost}", None),
        ("get", f"/api/trips/{ghost}/proposals", None),
    ]:
        response = send(client, method, path, payload)
        assert (response.status_code, response.json()["code"]) == (404, "not_found")


def test_anonymous_callers_get_401_on_every_route(anon, trip, seeded):
    for method, path, payload in routes(trip, *seeded):
        response = send(anon, method, path, payload)
        assert response.status_code == 401, (method, path)
        assert response.json()["code"] == "unauthenticated"


def test_unsafe_routes_require_csrf(ana, trip, seeded):
    strict = Client(enforce_csrf_checks=True)
    strict.force_login(ana)
    for method, path, payload in routes(trip, *seeded):
        if method in {"get", "head"}:
            continue
        response = send(strict, method, path, payload)
        assert response.status_code == 403, (method, path)
        assert response.json()["code"] == "csrf_failed"


def test_removed_members_get_404(as_person, ana, trip, make_proposal, crew):
    proposal = make_proposal()
    CrewMembership.objects.filter(crew=crew, person=ana).update(status="removed")
    assert send(as_person(ana), "get", f"/api/proposals/{proposal.pk}").status_code == 404


# --- listing ------------------------------------------------------------------------------------


def test_list_defaults_hide_discarded_and_come_newest_first(as_person, ana, trip, make_proposal):
    with time_machine.travel(NOW, tick=False):
        old = make_proposal(title="Vieja")
    with time_machine.travel(NOW + timedelta(days=1), tick=False):
        new = make_proposal(title="Nueva", category="food")
    make_proposal(title="Descartada", status="discarded")
    body = send(as_person(ana), "get", list_url(trip)).json()
    assert [p["id"] for p in body] == [str(new.pk), str(old.pk)]


def test_list_filters_by_category_status_and_discarded(as_person, ana, trip, make_proposal):
    lodging = make_proposal(title="A", category="lodging")
    food = make_proposal(title="B", category="food", status="discussing")
    gone = make_proposal(title="C", category="food", status="discarded")
    client = as_person(ana)

    def ids(query):
        return {p["id"] for p in send(client, "get", f"{list_url(trip)}?{query}").json()}

    assert ids("category=food") == {str(food.pk)}
    assert ids("category=food&category=lodging") == {str(food.pk), str(lodging.pk)}
    assert ids("status=discussing") == {str(food.pk)}
    assert ids("status=discarded") == {str(gone.pk)}
    assert ids("include_discarded=true&category=food") == {str(food.pk), str(gone.pk)}
    assert ids("include_discarded=true") == {str(lodging.pk), str(food.pk), str(gone.pk)}


@pytest.mark.parametrize("query", ["category=nope", "status=nope", "sort=random"])
def test_list_rejects_unknown_filters(as_person, ana, trip, query):
    response = send(as_person(ana), "get", f"{list_url(trip)}?{query}")
    assert (response.status_code, response.json()["code"]) == (400, "invalid_request")


def test_list_sorts_by_score_then_newest(as_person, ana, beto, cris, trip, make_proposal):
    with time_machine.travel(NOW, tick=False):
        first = make_proposal(title="uno")
    with time_machine.travel(NOW + timedelta(hours=1), tick=False):
        second = make_proposal(title="dos")
    with time_machine.travel(NOW + timedelta(hours=2), tick=False):
        third = make_proposal(title="tres")
    for person in (ana, beto):
        Vote.objects.create(proposal=first, person=person, value=1)
    Vote.objects.create(proposal=third, person=cris, value=-1)
    body = send(as_person(ana), "get", f"{list_url(trip)}?sort=score").json()
    assert [p["id"] for p in body] == [str(first.pk), str(second.pk), str(third.pk)]
    assert [p["tally"]["score"] for p in body] == [2, 0, -1]


def test_summary_shape_of_a_proposal(as_person, ana, beto, trip, make_proposal):
    proposal = make_proposal(
        title="Cabañas", est_price=Decimal("120.50"), currency="USD", price_basis="per_night"
    )
    Vote.objects.create(proposal=proposal, person=ana, value=1)
    Vote.objects.create(proposal=proposal, person=beto, value=0)
    Comment.objects.create(proposal=proposal, author=beto, body="x")
    item = send(as_person(ana), "get", list_url(trip)).json()[0]
    assert item["id"] == str(proposal.pk)
    assert item["trip_id"] == str(trip.pk)
    assert item["author"] == {"person_id": str(ana.pk), "display_name": "Ana"}
    assert (item["category"], item["status"], item["title"]) == ("lodging", "proposed", "Cabañas")
    assert (item["est_price"], item["currency"], item["price_basis"]) == (
        "120.50",
        "USD",
        "per_night",
    )
    assert item["tally"] == {
        "up": 1,
        "neutral": 1,
        "down": 0,
        "score": 1,
        "my_vote": 1,
        "majority": False,
    }
    assert item["comment_count"] == 1
    assert item["allowed_transitions"] == ["discussing", "chosen", "discarded"]
    assert item["web_path"] == f"/crews/{trip.crew_id}/trips/{trip.pk}/proposals/{proposal.pk}"
    assert item["preview"] is None
    assert set(item) >= {"note", "starts_on", "ends_on", "booking_ref", "created_at", "updated_at"}


def test_my_vote_is_per_viewer_and_majority_is_reported(
    as_person, ana, beto, cris, trip, make_proposal
):
    proposal = make_proposal()
    for person in (ana, beto):
        Vote.objects.create(proposal=proposal, person=person, value=1)
    mine = send(as_person(ana), "get", list_url(trip)).json()[0]["tally"]
    theirs = send(as_person(cris), "get", list_url(trip)).json()[0]["tally"]
    assert (mine["my_vote"], theirs["my_vote"]) == (1, None)
    assert mine["majority"] and theirs["majority"]  # 2 of 3 are in and voted +1


def test_preview_is_embedded_without_internal_fields(as_person, ana, trip, make_proposal):
    preview = LinkPreview.objects.create(
        url=URL,
        canonical_url="https://booking.com/x",
        site_name="Booking.com",
        title="Cabañas",
        fetch_status="ok",
        fetched_at=NOW,
        price_amount=Decimal("99.00"),
        price_currency="USD",
        lat=Decimal("-41.1"),
        lng=Decimal("-71.3"),
        raw={"secret": "x"},
    )
    preview.thumb_file.save("t.webp", ContentFile(b"x"), save=True)
    make_proposal(link_preview=preview)
    body = send(as_person(ana), "get", list_url(trip)).json()[0]["preview"]
    assert body["has_thumbnail"] is True
    assert (body["price_amount"], body["price_currency"]) == ("99.00", "USD")
    assert (body["lat"], body["lng"]) == (-41.1, -71.3)
    assert body["fetch_status"] == "ok"
    assert "raw" not in body and "thumb_file" not in body


def test_summary_endpoint_counts_and_top_three(as_person, ana, beto, trip, make_proposal):
    best = make_proposal(title="mejor")
    ok = make_proposal(title="ok", status="chosen")
    make_proposal(title="meh", status="discussing")
    make_proposal(title="otra")
    make_proposal(title="reservada", status="booked")
    make_proposal(title="muerta", status="discarded")
    for person in (ana, beto):
        Vote.objects.create(proposal=best, person=person, value=1)
    Vote.objects.create(proposal=ok, person=ana, value=1)
    body = send(as_person(ana), "get", f"{list_url(trip)}/summary").json()
    assert body["counts"] == {
        "proposed": 2,
        "discussing": 1,
        "chosen": 1,
        "booked": 1,
        "discarded": 1,
    }
    assert [p["title"] for p in body["top"]][:2] == ["mejor", "ok"]
    assert len(body["top"]) == 3
    assert "reservada" not in [p["title"] for p in body["top"]]


# --- creating -----------------------------------------------------------------------------------


@pytest.fixture
def async_fetch(settings, monkeypatch, django_capture_on_commit_callbacks):
    """Fetches go to the executor after commit instead of running inline."""
    from linkpreview.adapters import executor

    settings.LINKPREVIEW_FETCH_SYNC = False
    submitted = []
    monkeypatch.setattr(executor._executor, "submit", lambda fn, *args: submitted.append(args))
    return submitted


def test_creating_from_a_url_answers_with_a_pending_preview(
    as_person, ana, trip, fake, async_fetch, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        response = send(
            as_person(ana),
            "post",
            list_url(trip),
            {"url": f"{URL}?utm_source=wa&fbclid=1", "note": "¿Les copa?"},
        )
    assert response.status_code == 201
    body = response.json()
    assert body["preview"]["fetch_status"] == "pending"
    assert body["source"] == "web"
    assert (body["status"], body["note"]) == ("proposed", "¿Les copa?")
    assert body["category"] == "lodging"  # the host table
    assert body["title"] == "cabanas del sur"  # slug placeholder until the unfurl lands
    assert body["currency"] == "ARS"  # the trip currency
    assert body["votes"] == []
    proposal = Proposal.objects.get()
    assert proposal.canonical_url == "https://booking.com/hotel/ar/cabanas-del-sur.html"
    assert proposal.classified_by == "rules"
    assert len(async_fetch) == 1  # one unfurl queued, off the request
    assert fake.calls == []


def test_the_unfurl_then_fills_in_title_price_and_category(
    as_person, ana, trip, fake, async_fetch, django_capture_on_commit_callbacks
):
    fake.register(
        URL,
        PreviewData(
            url=URL,
            final_url=URL,
            title="Cabañas del Sur, San Martín",
            site_name="Booking.com",
            price_amount=Decimal("120.00"),
            price_currency="USD",
            fetch_status="ok",
        ),
    )
    with django_capture_on_commit_callbacks(execute=True):
        body = send(as_person(ana), "post", list_url(trip), {"url": URL}).json()
    from linkpreview.use_cases.fetch_preview import fetch_preview

    with django_capture_on_commit_callbacks(execute=True):
        fetch_preview(str(Proposal.objects.get().link_preview_id))
    again = send(as_person(ana), "get", f"/api/proposals/{body['id']}").json()
    assert again["title"] == "Cabañas del Sur, San Martín"
    assert (again["est_price"], again["currency"]) == ("120.00", "USD")
    assert again["preview"]["fetch_status"] == "ok"


def test_a_title_the_user_typed_survives_the_unfurl(
    as_person, ana, trip, fake, django_capture_on_commit_callbacks
):
    fake.register(URL, PreviewData(url=URL, final_url=URL, title="Del sitio", fetch_status="ok"))
    with django_capture_on_commit_callbacks(execute=True):
        body = send(
            as_person(ana), "post", list_url(trip), {"url": URL, "title": "Nuestro título"}
        ).json()
    assert send(as_person(ana), "get", f"/api/proposals/{body['id']}").json()["title"] == (
        "Nuestro título"
    )


def test_creating_with_only_a_title(as_person, ana, trip):
    response = send(
        as_person(ana),
        "post",
        list_url(trip),
        {
            "title": "  Cena en Mendoza ",
            "category": "food",
            "est_price": "45.5",
            "currency": "usd",
            "price_basis": "per_person",
            "starts_on": "2026-07-01",
            "ends_on": "2026-07-02",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert (body["title"], body["category"], body["preview"]) == ("Cena en Mendoza", "food", None)
    assert (body["est_price"], body["currency"], body["price_basis"]) == (
        "45.50",
        "USD",
        "per_person",
    )
    proposal = Proposal.objects.get()
    assert (proposal.classified_by, proposal.canonical_url) == ("user", None)


def test_two_title_only_proposals_are_not_duplicates(as_person, ana, trip):
    for _ in range(2):
        assert send(as_person(ana), "post", list_url(trip), {"title": "Igual"}).status_code == 201


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ({}, "invalid_request"),
        ({"note": "solo nota"}, "invalid_request"),
        ({"title": "   "}, "invalid_request"),
        ({"title": "x" * 301}, "invalid_request"),
        ({"title": "ok", "category": "nope"}, "invalid_request"),
        ({"title": "ok", "est_price": "abc"}, "invalid_request"),
        ({"title": "ok", "est_price": "-1"}, "invalid_request"),
        ({"title": "ok", "currency": "DOLLARS"}, "invalid_request"),
        ({"title": "ok", "price_basis": "per_week"}, "invalid_request"),
        ({"title": "ok", "note": "x" * 2001}, "invalid_request"),
        ({"url": "no es un link"}, "invalid_url"),
        ({"url": "ftp://example.com/x"}, "invalid_url"),
        ({"url": "https://" + "a" * 2100 + ".com"}, "invalid_url"),
        ({"url": "https://wa.me/5491155551111"}, "ignored_url"),
        ({"url": "https://chat.whatsapp.com/abc"}, "ignored_url"),
        ({"url": "https://viajecito.example.com/crews/1"}, "ignored_url"),
        ({"title": "ok", "starts_on": "2026-07-05", "ends_on": "2026-07-01"}, "invalid_dates"),
    ],
)
def test_invalid_creations_are_400_with_a_code(as_person, ana, trip, payload, code):
    response = send(as_person(ana), "post", list_url(trip), payload)
    assert (response.status_code, response.json()["code"]) == (400, code)
    assert Proposal.objects.count() == 0


def test_the_crews_gastito_host_is_not_a_proposal(as_person, ana, trip, crew):
    crew.gastito_group_url = "https://gastito.example.org/g/abc"
    crew.save()
    response = send(
        as_person(ana), "post", list_url(trip), {"url": "https://gastito.example.org/x"}
    )
    assert (response.status_code, response.json()["code"]) == (400, "ignored_url")


def test_a_duplicate_url_is_a_409_with_the_existing_proposal_id(as_person, ana, beto, trip):
    first = send(as_person(ana), "post", list_url(trip), {"url": URL}).json()
    response = send(
        as_person(beto),
        "post",
        list_url(trip),
        {"url": "https://booking.com/hotel/ar/cabanas-del-sur.html?utm_source=x"},
    )
    assert response.status_code == 409
    assert response.json() == {
        "code": "duplicate_proposal",
        "message": response.json()["message"],
        "proposal_id": first["id"],
    }
    assert Proposal.objects.count() == 1


def test_bare_www_urls_are_accepted(as_person, ana, trip):
    response = send(as_person(ana), "post", list_url(trip), {"url": "www.hostelworld.com/h/1"})
    assert response.status_code == 201
    assert Proposal.objects.get().canonical_url == "https://hostelworld.com/h/1"


# --- reading and editing ----------------------------------------------------------------------


def test_the_detail_has_votes_and_source(as_person, ana, beto, trip, make_proposal):
    proposal = make_proposal()
    Vote.objects.create(proposal=proposal, person=beto, value=-1)
    body = send(as_person(ana), "get", f"/api/proposals/{proposal.pk}").json()
    assert body["votes"] == [
        {"person": {"person_id": str(beto.pk), "display_name": "Beto"}, "value": -1}
    ]
    assert body["source"] == "web"
    assert (body["chosen_at"], body["booked_at"], body["discarded_at"]) == (None, None, None)


def test_patch_updates_fields_and_a_category_edit_is_the_users(as_person, ana, make_proposal):
    proposal = make_proposal(classified_by="rules", est_price=Decimal("10.00"))
    response = send(
        as_person(ana),
        "patch",
        f"/api/proposals/{proposal.pk}",
        {
            "title": "Nuevo",
            "note": "ojo",
            "category": "activity",
            "est_price": None,
            "currency": "ars",
            "price_basis": "per_person",
            "starts_on": "2026-08-01",
            "ends_on": "2026-08-03",
            "booking_ref": "ZZ9",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["title"], body["category"], body["est_price"], body["currency"]) == (
        "Nuevo",
        "activity",
        None,
        "ARS",
    )
    assert body["booking_ref"] == "ZZ9"
    proposal.refresh_from_db()
    assert proposal.classified_by == "user"


def test_patch_without_category_keeps_the_classifier_provenance(as_person, ana, make_proposal):
    proposal = make_proposal(classified_by="rules")
    send(as_person(ana), "patch", f"/api/proposals/{proposal.pk}", {"title": "Otro"})
    proposal.refresh_from_db()
    assert proposal.classified_by == "rules"


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ({"title": ""}, "invalid_request"),
        ({"category": "nope"}, "invalid_request"),
        ({"est_price": "x"}, "invalid_request"),
        ({"starts_on": "2026-08-05", "ends_on": "2026-08-01"}, "invalid_dates"),
        ({"ends_on": "2026-01-01"}, "invalid_dates"),  # merged with the stored starts_on
    ],
)
def test_patch_validation(as_person, ana, make_proposal, payload, code):
    proposal = make_proposal(starts_on="2026-02-01")
    response = send(as_person(ana), "patch", f"/api/proposals/{proposal.pk}", payload)
    assert (response.status_code, response.json()["code"]) == (400, code)


def test_any_member_may_edit_flat_roles(as_person, beto, make_proposal):
    proposal = make_proposal()
    assert (
        send(as_person(beto), "patch", f"/api/proposals/{proposal.pk}", {"title": "x"}).status_code
        == 200
    )


# --- status transitions ---------------------------------------------------------------------


def test_transition_walks_the_graph_and_reports_allowed_moves(as_person, ana, make_proposal):
    proposal = make_proposal()
    client = as_person(ana)
    path = f"/api/proposals/{proposal.pk}/transition"
    chosen = send(client, "post", path, {"to": "chosen"}).json()
    assert chosen["status"] == "chosen" and chosen["chosen_at"] is not None
    assert chosen["allowed_transitions"] == ["booked", "discussing", "discarded"]
    booked = send(client, "post", path, {"to": "booked", "booking_ref": "R-77"}).json()
    assert (booked["status"], booked["booking_ref"]) == ("booked", "R-77")
    assert booked["booked_at"] is not None


def test_transition_to_the_same_status_is_a_200_noop(as_person, ana, make_proposal):
    proposal = make_proposal(status="chosen")
    response = send(
        as_person(ana), "post", f"/api/proposals/{proposal.pk}/transition", {"to": "chosen"}
    )
    assert (response.status_code, response.json()["status"]) == (200, "chosen")


def test_invalid_transitions_are_409(as_person, ana, make_proposal):
    proposal = make_proposal(status="proposed")
    response = send(
        as_person(ana), "post", f"/api/proposals/{proposal.pk}/transition", {"to": "booked"}
    )
    assert (response.status_code, response.json()["code"]) == (409, "invalid_transition")
    proposal.refresh_from_db()
    assert proposal.status == "proposed"


def test_unknown_target_status_is_a_400(as_person, ana, make_proposal):
    proposal = make_proposal()
    response = send(
        as_person(ana), "post", f"/api/proposals/{proposal.pk}/transition", {"to": "nope"}
    )
    assert (response.status_code, response.json()["code"]) == (400, "invalid_request")


def test_transitions_publish_the_event_with_the_web_actor(as_person, ana, make_proposal):
    from shared import events

    proposal = make_proposal()
    seen = []
    with events.isolated():
        events.subscribe("proposal.status_changed", lambda **p: seen.append(p))
        send(as_person(ana), "post", f"/api/proposals/{proposal.pk}/transition", {"to": "chosen"})
    assert [(e["from_status"], e["to_status"], e["actor_id"]) for e in seen] == [
        ("proposed", "chosen", str(ana.pk))
    ]


# --- votes and comments -------------------------------------------------------------------------


def test_vote_put_replaces_and_delete_is_idempotent(as_person, ana, make_proposal):
    proposal = make_proposal()
    client, path = as_person(ana), f"/api/proposals/{proposal.pk}/vote"
    assert send(client, "put", path, {"value": 1}).json()["my_vote"] == 1
    tally = send(client, "put", path, {"value": -1}).json()
    assert (tally["up"], tally["down"], tally["my_vote"]) == (0, 1, -1)
    assert send(client, "delete", path).json()["my_vote"] is None
    response = send(client, "delete", path)
    assert (response.status_code, response.json()["up"]) == (200, 0)


@pytest.mark.parametrize("value", [2, -2, "up", None])
def test_vote_values_are_validated(as_person, ana, make_proposal, value):
    proposal = make_proposal()
    response = send(as_person(ana), "put", f"/api/proposals/{proposal.pk}/vote", {"value": value})
    assert (response.status_code, response.json()["code"]) == (400, "invalid_request")


def test_voting_on_a_discarded_proposal_is_409(as_person, ana, make_proposal):
    proposal = make_proposal(status="discarded")
    response = send(as_person(ana), "put", f"/api/proposals/{proposal.pk}/vote", {"value": 1})
    assert (response.status_code, response.json()["code"]) == (409, "proposal_closed")


def test_comments_are_listed_oldest_first_and_created(as_person, ana, beto, make_proposal):
    proposal = make_proposal()
    path = f"/api/proposals/{proposal.pk}/comments"
    with time_machine.travel(NOW, tick=False):
        Comment.objects.create(proposal=proposal, author=beto, body="primero")
    created = send(as_person(ana), "post", path, {"body": " segundo "})
    assert created.status_code == 201
    body = created.json()
    assert (body["body"], body["source"], body["can_delete"]) == ("segundo", "web", True)
    assert body["author"]["display_name"] == "Ana"
    listed = send(as_person(ana), "get", path).json()
    assert [c["body"] for c in listed] == ["primero", "segundo"]
    assert [c["can_delete"] for c in listed] == [False, True]
    proposal.refresh_from_db()
    assert proposal.status == "discussing"


@pytest.mark.parametrize("body", ["", "   ", "x" * 2001])
def test_invalid_comments_are_400(as_person, ana, make_proposal, body):
    proposal = make_proposal()
    response = send(
        as_person(ana), "post", f"/api/proposals/{proposal.pk}/comments", {"body": body}
    )
    assert (response.status_code, response.json()["code"]) == (400, "invalid_request")


def test_only_the_author_deletes_a_comment(as_person, ana, beto, make_proposal):
    proposal = make_proposal()
    comment = Comment.objects.create(proposal=proposal, author=beto, body="mío")
    forbidden = send(as_person(ana), "delete", f"/api/comments/{comment.pk}")
    assert (forbidden.status_code, forbidden.json()["code"]) == (403, "forbidden")
    assert Comment.objects.count() == 1
    assert send(as_person(beto), "delete", f"/api/comments/{comment.pk}").status_code == 204
    assert Comment.objects.count() == 0


# --- preview refresh and thumbnail ----------------------------------------------------------


def test_refresh_preview_requeues_once_per_ten_minutes(
    as_person, ana, make_proposal, fake, django_capture_on_commit_callbacks
):
    preview = LinkPreview.objects.create(
        url=URL, canonical_url="https://booking.com/x", fetch_status="ok", fetched_at=NOW
    )
    proposal = make_proposal(link_preview=preview)
    path = f"/api/proposals/{proposal.pk}/refresh_preview"
    with time_machine.travel(NOW + timedelta(minutes=5), tick=False):
        too_soon = send(as_person(ana), "post", path)
    assert (too_soon.status_code, too_soon.json()["code"]) == (409, "refresh_too_soon")
    with time_machine.travel(NOW + timedelta(minutes=30), tick=False):
        with django_capture_on_commit_callbacks(execute=True):
            response = send(as_person(ana), "post", path)
    assert (response.status_code, response.json()) == (202, {"status": "queued"})
    assert fake.calls == [URL]


def test_refresh_is_refused_while_pending_and_404_without_a_url(as_person, ana, make_proposal):
    pending = LinkPreview.objects.create(url=URL, canonical_url="https://booking.com/p")
    with_url = make_proposal(link_preview=pending)
    response = send(as_person(ana), "post", f"/api/proposals/{with_url.pk}/refresh_preview")
    assert (response.status_code, response.json()["code"]) == (409, "refresh_too_soon")
    title_only = make_proposal(title="solo título")
    response = send(as_person(ana), "post", f"/api/proposals/{title_only.pk}/refresh_preview")
    assert (response.status_code, response.json()["code"]) == (404, "not_found")


def webp_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 36), "teal").save(buffer, "WEBP")
    return buffer.getvalue()


def test_the_thumbnail_is_served_through_the_authorized_endpoint(as_person, ana, make_proposal):
    preview = LinkPreview.objects.create(url=URL, canonical_url="https://booking.com/t")
    preview.thumb_file.save("abc.webp", ContentFile(webp_bytes()), save=True)
    proposal = make_proposal(link_preview=preview)
    response = send(as_person(ana), "get", f"/api/proposals/{proposal.pk}/thumbnail")
    assert response.status_code == 200
    assert response["Content-Type"] == "image/webp"
    assert response["Cache-Control"] == "private, max-age=86400"
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response.content == webp_bytes()


def test_no_thumbnail_is_a_404(as_person, ana, make_proposal):
    proposal = make_proposal(
        link_preview=LinkPreview.objects.create(url=URL, canonical_url="https://booking.com/n")
    )
    assert send(as_person(ana), "get", f"/api/proposals/{proposal.pk}/thumbnail").status_code == 404
    bare = make_proposal(title="sin preview")
    assert send(as_person(ana), "get", f"/api/proposals/{bare.pk}/thumbnail").status_code == 404


def test_the_thumbnail_200_is_documented_as_binary_webp_in_the_openapi(anon):
    spec = anon.get("/api/openapi.json").json()
    ok = spec["paths"]["/api/proposals/{proposal_id}/thumbnail"]["get"]["responses"]["200"]
    assert ok["content"]["image/webp"]["schema"] == {"type": "string", "format": "binary"}
