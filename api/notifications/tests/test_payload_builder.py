import json

import pytest

from messaging.reminders import ReminderDraft
from notifications.copy.es_ar import TITLE_DEFAULT
from notifications.domain.payload import (
    MAX_BODY_CHARS,
    MAX_PAYLOAD_BYTES,
    build_payload,
    category_of,
)

NOW = 1_790_000_000
ANA = "11111111-1111-1111-1111-111111111111"


def draft(**overrides) -> ReminderDraft:
    fields = {
        "crew_id": "c1",
        "trip_id": "t1",
        "body": "Hola grupo",
        "dedupe_key": "logistics:nag:t1:2026-10-01",
        "timezone": "UTC",
        "title": "Tareas",
        "url_path": "/crews/c1/trips/t1/logistics",
    }
    return ReminderDraft(**{**fields, **overrides})


def test_payload_carries_title_body_url_tag_and_timestamp():
    assert build_payload(draft(), {}, NOW) == {
        "title": "Tareas",
        "body": "Hola grupo",
        "url": "/crews/c1/trips/t1/logistics",
        "tag": "logistics:nag:t1:2026-10-01",
        "ts": NOW,
    }


def test_title_falls_back_to_the_default():
    assert build_payload(draft(title=""), {}, NOW)["title"] == TITLE_DEFAULT


def test_mention_tokens_become_display_names():
    body = f"Che {{@{ANA}}}, falta tu parte"
    assert build_payload(draft(body=body), {ANA: "Ana"}, NOW)["body"] == "Che Ana, falta tu parte"


def test_unknown_mention_tokens_are_dropped_without_double_spaces():
    body = f"Che {{@{ANA}}} falta algo"
    assert build_payload(draft(body=body), {}, NOW)["body"] == "Che falta algo"


def test_long_bodies_are_truncated_with_an_ellipsis():
    body = build_payload(draft(body="a" * 500), {}, NOW)["body"]
    assert len(body) == MAX_BODY_CHARS
    assert body.endswith("…")


def test_the_tag_is_capped_at_64_characters():
    assert len(build_payload(draft(dedupe_key="k" * 200), {}, NOW)["tag"]) == 64


@pytest.mark.parametrize(
    "unsafe",
    ["//evil.example", "https://evil.example/x", "javascript:alert(1)", "relative", "", "/\\evil"],
)
def test_unsafe_or_missing_url_paths_become_the_root(unsafe):
    assert build_payload(draft(url_path=unsafe), {}, NOW)["url"] == "/"


def test_serialized_payload_never_exceeds_the_byte_budget():
    huge = draft(title="é" * 5000, body="ñ" * 5000, url_path="/" + "x" * 5000, dedupe_key="é" * 200)
    payload = build_payload(huge, {}, NOW)
    assert len(json.dumps(payload, ensure_ascii=False).encode()) <= MAX_PAYLOAD_BYTES
    assert payload["url"] == "/"


@pytest.mark.parametrize(
    ("key", "category"),
    [
        ("itinerary:digest:t1:2026-10-01", "digest"),
        ("notifications:countdown:t1:T-7", "countdown"),
        ("proposals:majority:p1", "proposals"),
        ("logistics:nag:t1:2026-10-01", "reminders"),
        ("anything", "reminders"),
    ],
)
def test_category_comes_from_the_dedupe_key_prefix(key, category):
    assert category_of(key) == category
