import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from crews.models import Crew
from identity.models import Person
from shared.timezones import InvalidTimezoneError
from ski.models import (
    GearPlan,
    LiftPass,
    Resort,
    SkiProfile,
    SnowFetchState,
    SnowReport,
    TripResort,
)
from trips.models import Trip

pytestmark = pytest.mark.django_db


def make_resort(slug="cerro-catedral", **extra):
    fields = dict(
        slug=slug,
        name="Cerro Catedral",
        country="AR",
        lat=Decimal("-41.17"),
        lng=Decimal("-71.44"),
        base_elev_m=1030,
        summit_elev_m=2100,
        timezone="America/Argentina/Salta",
    )
    return Resort.objects.create(**{**fields, **extra})


@pytest.fixture
def trip():
    crew = Crew.objects.create(name="Los Pibes")
    return Trip.objects.create(crew=crew, name="Bariloche", type="ski")


@pytest.fixture
def person():
    return Person.objects.create_user("+5491155551111", display_name="Ana")


def test_models_use_uuid_pks_and_timestamps():
    resort = make_resort()
    assert isinstance(resort.pk, uuid.UUID)
    assert resort.created_at and resort.updated_at
    assert resort.provider == "open_meteo" and resort.active is True


def test_resort_slug_is_unique():
    make_resort()
    with pytest.raises(IntegrityError), transaction.atomic():
        make_resort()


def test_summit_must_be_above_base():
    with pytest.raises(IntegrityError), transaction.atomic():
        make_resort(slug="flat", base_elev_m=2000, summit_elev_m=2000)


def test_resort_timezone_must_be_iana():
    resort = Resort(
        slug="bad",
        name="Bad",
        country="AR",
        lat=Decimal("-41.17"),
        lng=Decimal("-71.44"),
        base_elev_m=1000,
        summit_elev_m=2000,
        timezone="Mars/Olympus",
    )
    with pytest.raises(ValidationError):
        resort.full_clean()
    with pytest.raises(InvalidTimezoneError):
        resort.save()


def test_trip_resort_is_unique_per_trip(trip):
    resort = make_resort()
    TripResort.objects.create(trip=trip, resort=resort)
    with pytest.raises(IntegrityError), transaction.atomic():
        TripResort.objects.create(trip=trip, resort=resort)


def test_resort_in_use_cannot_be_deleted(trip):
    resort = make_resort()
    TripResort.objects.create(trip=trip, resort=resort)
    from django.db.models import ProtectedError

    with pytest.raises(ProtectedError):
        resort.delete()


def test_snow_report_history_is_never_updated_in_place():
    resort = make_resort()
    report = SnowReport.objects.create(
        resort=resort,
        source="manual",
        observed_at=datetime(2026, 7, 15, tzinfo=UTC),
        fetched_at=datetime(2026, 7, 15, tzinfo=UTC),
        base_cm=100,
    )
    report.base_cm = 120
    with pytest.raises(ValueError):
        report.save()


def test_fetch_state_is_one_per_resort():
    resort = make_resort()
    SnowFetchState.objects.create(resort=resort)
    with pytest.raises(IntegrityError), transaction.atomic():
        SnowFetchState.objects.create(resort=resort)


def test_ski_profile_defaults_and_ranges(person):
    profile = SkiProfile.objects.create(person=person)
    assert (profile.discipline, profile.level) == ("ski", "beginner")
    assert profile.owns_gear is False and profile.share_sizes_with_trip is False
    for bad in ({"boot_size_eu": Decimal("20")}, {"height_cm": 50}, {"weight_kg": 300}):
        profile = SkiProfile(person=person, **bad)
        with pytest.raises(ValidationError):
            profile.full_clean()


def test_lift_pass_unique_per_resort_and_one_resort_less_row(trip, person):
    resort = make_resort()
    LiftPass.objects.create(trip=trip, person=person, resort=resort)
    with pytest.raises(IntegrityError), transaction.atomic():
        LiftPass.objects.create(trip=trip, person=person, resort=resort)
    LiftPass.objects.create(trip=trip, person=person, resort=None)
    with pytest.raises(IntegrityError), transaction.atomic():
        LiftPass.objects.create(trip=trip, person=person, resort=None)


def test_gear_plan_unique_per_item(trip, person):
    GearPlan.objects.create(trip=trip, person=person, item="skis", mode="rent")
    with pytest.raises(IntegrityError), transaction.atomic():
        GearPlan.objects.create(trip=trip, person=person, item="skis", mode="own")
    GearPlan.objects.create(trip=trip, person=person, item="boots", mode="own")
