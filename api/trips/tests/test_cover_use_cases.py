from dataclasses import replace

import pytest

from trips.domain import InvalidCoverError, TripData
from trips.use_cases.clear_trip_cover import clear_trip_cover
from trips.use_cases.get_trip import TripNotFoundError
from trips.use_cases.read_trip_cover import read_trip_cover
from trips.use_cases.set_trip_cover import set_trip_cover

TRIP = TripData(
    id="t1",
    crew_id="c1",
    name="Bariloche",
    type="generic",
    status="planning",
    start_on=None,
    end_on=None,
    destination_label="",
    timezone="UTC",
    currency="USD",
    fx_rates={},
)


class FakeStore:
    def __init__(self, trip=TRIP):
        self.trip = trip
        self.cover: bytes | None = None

    def get(self, trip_id):
        return self.trip if self.trip and self.trip.id == trip_id else None

    def set_cover(self, trip_id, webp):
        self.cover = webp
        self.trip = replace(self.trip, has_cover=True, cover_version=self.trip.cover_version + 1)
        return self.trip

    def clear_cover(self, trip_id):
        if self.cover is not None:
            self.cover = None
            self.trip = replace(
                self.trip, has_cover=False, cover_version=self.trip.cover_version + 1
            )
        return self.trip

    def read_cover(self, trip_id):
        return self.cover


def upper(data: bytes) -> bytes:
    return data.upper()


def test_setting_a_cover_stores_the_processed_bytes():
    store = FakeStore()
    trip = set_trip_cover("t1", b"abc", store, upper)
    assert store.cover == b"ABC"
    assert (trip.has_cover, trip.cover_version) == (True, 1)


def test_replacing_a_cover_bumps_the_version():
    store = FakeStore()
    set_trip_cover("t1", b"one", store, upper)
    trip = set_trip_cover("t1", b"two", store, upper)
    assert (trip.cover_version, store.cover) == (2, b"TWO")


def test_a_rejected_image_leaves_the_cover_and_the_version_untouched():
    store = FakeStore()
    set_trip_cover("t1", b"one", store, upper)

    def reject(data):
        raise InvalidCoverError("invalid_image")

    with pytest.raises(InvalidCoverError):
        set_trip_cover("t1", b"bad", store, reject)
    assert (store.cover, store.trip.cover_version) == (b"ONE", 1)


def test_an_unknown_trip_raises():
    with pytest.raises(TripNotFoundError):
        set_trip_cover("nope", b"x", FakeStore(), upper)
    with pytest.raises(TripNotFoundError):
        clear_trip_cover("nope", FakeStore())


def test_clearing_removes_the_cover_and_bumps_the_version():
    store = FakeStore()
    set_trip_cover("t1", b"one", store, upper)
    trip = clear_trip_cover("t1", store)
    assert (trip.has_cover, trip.cover_version, store.cover) == (False, 2, None)


def test_clearing_is_idempotent():
    store = FakeStore()
    first = clear_trip_cover("t1", store)
    second = clear_trip_cover("t1", store)
    assert first == second
    assert (second.has_cover, second.cover_version) == (False, 0)


def test_reading_returns_the_bytes_or_none():
    store = FakeStore()
    assert read_trip_cover("t1", store) is None
    set_trip_cover("t1", b"one", store, upper)
    assert read_trip_cover("t1", store) == b"ONE"
