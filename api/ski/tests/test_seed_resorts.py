import json
from decimal import Decimal
from io import StringIO
from zoneinfo import ZoneInfo

import pytest
from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from ski.models import Resort
from ski.seed import FIXTURE, load_resorts

pytestmark = pytest.mark.django_db

ENTRIES = json.loads(FIXTURE.read_text(encoding="utf-8"))


def seed() -> str:
    out = StringIO()
    call_command("seed_resorts", stdout=out)
    return out.getvalue()


def test_the_command_creates_every_resort():
    assert seed() == f"resorts: {len(ENTRIES)} created, 0 updated\n"
    assert Resort.objects.count() == len(ENTRIES) == 13
    assert Resort.objects.filter(country="CL").count() == 6
    assert Resort.objects.filter(country="AR").count() == 7


def test_running_it_twice_is_idempotent():
    seed()
    assert seed() == f"resorts: 0 created, {len(ENTRIES)} updated\n"
    assert Resort.objects.count() == len(ENTRIES)


def test_a_rerun_restores_seeded_fields_but_keeps_the_row():
    seed()
    row = Resort.objects.get(slug="cerro-catedral")
    pk = row.pk
    row.summit_elev_m = 9999
    row.active = False
    row.save()
    seed()
    row.refresh_from_db()
    assert row.pk == pk and row.summit_elev_m == 2100
    assert row.active is False  # operators may switch a resort off; seeding never reactivates it


@pytest.mark.parametrize("entry", ENTRIES, ids=lambda e: e["slug"])
def test_every_row_is_sound(entry):
    ZoneInfo(entry["timezone"])  # a valid IANA zone
    assert entry["summit_elev_m"] > entry["base_elev_m"]
    assert entry["country"] in ("AR", "CL")
    assert -56 < Decimal(entry["lat"]) < -17 and -76 < Decimal(entry["lng"]) < -62
    assert entry["verification"]  # every row says where its numbers come from


def test_slugs_are_unique_and_slug_shaped():
    slugs = [e["slug"] for e in ENTRIES]
    assert len(slugs) == len(set(slugs))
    assert all(s == s.lower() and " " not in s for s in slugs)


def test_loader_ignores_unknown_keys_and_reports_counts():
    assert load_resorts(Resort) == (13, 0)
    assert load_resorts(Resort) == (0, 13)


def test_the_resort_summit_check_holds_for_the_seed():
    seed()
    for resort in Resort.objects.all():
        assert resort.summit_elev_m > resort.base_elev_m
        ZoneInfo(resort.timezone)


@pytest.mark.django_db(transaction=True)
def test_the_data_migration_seeds_on_forward_and_cleans_on_reverse():
    executor = MigrationExecutor(connection)
    executor.migrate([("ski", "0001_initial")])
    Resort.objects.all().delete()
    executor = MigrationExecutor(connection)
    executor.migrate([("ski", "0002_seed_resorts")])
    assert Resort.objects.count() == 13
    executor = MigrationExecutor(connection)
    executor.migrate([("ski", "0001_initial")])
    assert Resort.objects.count() == 0
    MigrationExecutor(connection).migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())
