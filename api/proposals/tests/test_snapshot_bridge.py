"""Cross-app reads stay behind pure use cases and the configured store port."""

import uuid
from decimal import Decimal
from unittest.mock import Mock

import pytest

from proposals import ports
from proposals.domain.types import ProposalRecord
from proposals.ports import ProposalStore
from proposals.use_cases.get_proposal_snapshot import get_proposal_snapshot
from proposals.use_cases.list_trip_proposals import list_trip_proposals


@pytest.fixture
def fake_store(monkeypatch):
    store = Mock(spec=ProposalStore)
    monkeypatch.setattr(ports, "_default_factory", lambda: store)
    return store


def test_snapshot_uses_configured_store_and_returns_record(fake_store):
    snapshot = Mock(spec=ProposalRecord)
    fake_store.get.return_value = snapshot
    assert get_proposal_snapshot("proposal-id") is snapshot
    fake_store.get.assert_called_once_with("proposal-id")


def test_snapshot_returns_none_for_missing_proposal(fake_store):
    fake_store.get.return_value = None
    assert get_proposal_snapshot("missing") is None


@pytest.mark.parametrize("statuses", [None, (), ("chosen", "booked"), {"discarded"}])
def test_list_preserves_store_results_and_status_filter(fake_store, statuses):
    records = [Mock(spec=ProposalRecord), Mock(spec=ProposalRecord)]
    fake_store.list_for_trip.return_value = records
    assert list_trip_proposals("trip-id", statuses) is records
    fake_store.list_for_trip.assert_called_once_with("trip-id", statuses=statuses)


def test_explicit_store_does_not_require_default_configuration(monkeypatch):
    monkeypatch.setattr(ports, "_default_factory", None)
    store = Mock(spec=ProposalStore)
    assert get_proposal_snapshot("proposal-id", store=store) is store.get.return_value
    assert list_trip_proposals("trip-id", store=store) is store.list_for_trip.return_value


def test_missing_default_configuration_fails_clearly(monkeypatch):
    monkeypatch.setattr(ports, "_default_factory", None)
    with pytest.raises(RuntimeError, match="no default proposal store configured"):
        get_proposal_snapshot("proposal-id")
    with pytest.raises(RuntimeError, match="no default proposal store configured"):
        list_trip_proposals("trip-id")


@pytest.mark.django_db
def test_app_ready_configures_real_snapshot_store(make_proposal):
    proposal = make_proposal(est_price=Decimal("125.50"), booking_ref="ABC", status="chosen")
    snapshot = get_proposal_snapshot(str(proposal.pk))
    assert isinstance(snapshot, ProposalRecord)
    assert snapshot.id == str(proposal.pk)
    assert snapshot.trip_id == str(proposal.trip_id)
    assert snapshot.booking_ref == "ABC"
    assert snapshot.est_price == proposal.est_price
    assert get_proposal_snapshot(str(uuid.uuid4())) is None
    assert get_proposal_snapshot("not-a-uuid") is None


@pytest.mark.django_db
def test_real_list_filters_statuses_and_trip_newest_first(make_proposal, trip, crew):
    older = make_proposal(status="chosen")
    newest = make_proposal(status="booked")
    make_proposal(status="discarded")
    other_trip = type(trip).objects.create(crew=crew, name="Other")
    make_proposal(trip=other_trip, status="chosen")
    records = list_trip_proposals(str(trip.pk), ("chosen", "booked"))
    assert [record.id for record in records] == [str(newest.pk), str(older.pk)]
    assert list_trip_proposals(str(trip.pk), ()) == []
    assert len(list_trip_proposals(str(trip.pk))) == 3
    assert list_trip_proposals(str(uuid.uuid4())) == []


@pytest.mark.django_db
def test_real_list_keeps_existing_500_record_limit(make_proposal, trip):
    proposals = [make_proposal() for _ in range(501)]
    records = list_trip_proposals(str(trip.pk))
    assert len(records) == 500
    assert records[0].id == str(proposals[-1].pk)
    assert str(proposals[0].pk) not in {record.id for record in records}
