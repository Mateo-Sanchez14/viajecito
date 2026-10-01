"""Trusted cross-app reads expose a trip regardless of its lifecycle status."""

import uuid
from unittest.mock import Mock

import pytest

from trips import ports
from trips.domain import TRIP_STATUSES, TripData
from trips.models import Trip
from trips.ports import TripStore
from trips.use_cases.get_trip_snapshot import get_trip_snapshot


def test_snapshot_delegates_to_configured_store(monkeypatch):
    store = Mock(spec=TripStore)
    snapshot = Mock(spec=TripData)
    store.get.return_value = snapshot
    monkeypatch.setattr(ports, "_default_factory", lambda: store)
    assert get_trip_snapshot("trip-id") is snapshot
    store.get.assert_called_once_with("trip-id")


def test_missing_snapshot_returns_none(monkeypatch):
    store = Mock(spec=TripStore)
    store.get.return_value = None
    monkeypatch.setattr(ports, "_default_factory", lambda: store)
    assert get_trip_snapshot("missing") is None


def test_missing_default_configuration_fails_clearly(monkeypatch):
    monkeypatch.setattr(ports, "_default_factory", None)
    with pytest.raises(RuntimeError, match="no default trip store configured"):
        get_trip_snapshot("trip-id")


@pytest.mark.django_db
@pytest.mark.parametrize("status", TRIP_STATUSES)
def test_configured_snapshot_reads_every_status(crew, status):
    trip = Trip.objects.create(
        crew=crew,
        name="Snapshot trip",
        status=status,
        start_on="2026-07-10",
        end_on="2026-07-12",
        destination_label="Bariloche",
        currency="ARS",
        fx_rates={"USD": "1500"},
    )
    snapshot = get_trip_snapshot(str(trip.pk))
    assert isinstance(snapshot, TripData)
    assert snapshot.id == str(trip.pk)
    assert snapshot.crew_id == str(crew.pk)
    assert snapshot.status == status
    assert snapshot.name == "Snapshot trip"
    assert snapshot.timezone == crew.timezone
    assert str(snapshot.start_on) == "2026-07-10"
    assert str(snapshot.end_on) == "2026-07-12"
    assert snapshot.destination_label == "Bariloche"
    assert snapshot.currency == "ARS"
    assert snapshot.fx_rates == {"USD": "1500"}


@pytest.mark.django_db
def test_configured_snapshot_of_unknown_trip_returns_none():
    assert get_trip_snapshot(str(uuid.uuid4())) is None
