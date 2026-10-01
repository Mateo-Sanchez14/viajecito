import pytest
from django.db import connection


@pytest.mark.django_db
def test_journal_mode_is_wal():
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA journal_mode")
        assert cursor.fetchone()[0].lower() == "wal"


@pytest.mark.django_db
def test_foreign_keys_are_enforced():
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA foreign_keys")
        assert cursor.fetchone()[0] == 1


@pytest.mark.django_db
def test_synchronous_normal_and_busy_timeout():
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA synchronous")
        assert cursor.fetchone()[0] == 1  # NORMAL
        cursor.execute("PRAGMA busy_timeout")
        assert cursor.fetchone()[0] == 5000


def test_transaction_mode_is_immediate():
    assert connection.settings_dict["OPTIONS"]["transaction_mode"] == "IMMEDIATE"
