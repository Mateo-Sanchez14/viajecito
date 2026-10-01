"""Django persistence adapter of the ski ports."""

from datetime import datetime, timedelta
from decimal import Decimal

from django.apps import apps
from django.db import IntegrityError, transaction
from django.db.models import Max, Q

from crews.use_cases.active_member_ids import active_member_ids
from ski import domain
from ski.domain import (
    GearInput,
    GearRecord,
    ManualReportInput,
    Participant,
    PassInput,
    PassRecord,
    PersonRef,
    ProfileInput,
    ProfileRecord,
    ReportData,
    ResortAlreadyAddedError,
    ResortData,
    TripInfo,
    TripResortData,
)
from ski.models import (
    GearPlan,
    LiftPass,
    Resort,
    SkiProfile,
    SnowFetchState,
    SnowReport,
    TripResort,
)
from ski.ports import FetchState, RefreshCandidate, ResortRef, SnowReading
from trips.use_cases.trip_participants import trip_participants


def resort_ref(resort: Resort) -> ResortRef:
    return ResortRef(
        id=str(resort.pk),
        slug=resort.slug,
        name=resort.name,
        lat=float(resort.lat),
        lng=float(resort.lng),
        base_elev_m=resort.base_elev_m,
        summit_elev_m=resort.summit_elev_m,
        timezone=resort.timezone,
        provider_ref=resort.provider_ref,
    )


class DjangoSnowStore:
    """``SnowRefreshStore`` on the ORM."""

    def eligible_resorts(self, now: datetime) -> list[RefreshCandidate]:
        yesterday = now.date() - timedelta(days=1)
        linked = TripResort.objects.filter(
            trip__status__in=domain.ACTIVE_TRIP_STATUSES,
            resort__active=True,
            resort__provider=Resort.Provider.OPEN_METEO,
        ).filter(Q(trip__end_on__isnull=True) | Q(trip__end_on__gte=yesterday))
        resorts = Resort.objects.filter(pk__in=linked.values("resort_id")).order_by("slug")
        states = {s.resort_id: s for s in SnowFetchState.objects.filter(resort__in=resorts)}
        candidates = []
        for resort in resorts:
            state = states.get(resort.pk)
            candidates.append(
                RefreshCandidate(
                    resort=resort_ref(resort),
                    state=FetchState(
                        consecutive_failures=state.consecutive_failures if state else 0,
                        last_success_at=state.last_success_at if state else None,
                        next_attempt_at=state.next_attempt_at if state else None,
                    ),
                )
            )
        return candidates

    def record_success(self, resort_id: str, reading: SnowReading, now: datetime) -> None:
        with transaction.atomic():
            SnowReport.objects.create(
                resort_id=resort_id,
                source=SnowReport.Source.OPEN_METEO,
                observed_at=reading.observed_at,
                fetched_at=now,
                elevation_m=reading.elevation_m,
                base_cm=reading.base_cm,
                new_24h_cm=reading.new_24h_cm,
                forecast_72h_cm=reading.forecast_72h_cm,
                temp_c=reading.temp_c,
                raw=reading.raw,
            )
            SnowFetchState.objects.update_or_create(
                resort_id=resort_id,
                defaults={
                    "last_attempt_at": now,
                    "last_success_at": now,
                    "consecutive_failures": 0,
                    "next_attempt_at": now + domain.REFRESH_EVERY,
                    "last_error": "",
                },
            )

    def record_failure(
        self, resort_id: str, reason: str, now: datetime, next_attempt_at: datetime, failures: int
    ) -> None:
        SnowFetchState.objects.update_or_create(
            resort_id=resort_id,
            defaults={
                "last_attempt_at": now,
                "consecutive_failures": failures,
                "next_attempt_at": next_attempt_at,
                "last_error": reason[:200],
            },
        )

    def prune_provider_reports(self, before: datetime) -> int:
        deleted, _ = SnowReport.objects.filter(
            source=SnowReport.Source.OPEN_METEO, observed_at__lt=before
        ).delete()
        return deleted


__all__ = ["DjangoSnowStore", "Decimal", "resort_ref"]


def _person_ref(person) -> PersonRef | None:
    if person is None:
        return None
    if not person.display_name:  # never fall back to the phone: reports cross crews
        return None
    return PersonRef(str(person.pk), person.display_name)


def report_data(report: SnowReport) -> ReportData:
    return ReportData(
        id=str(report.pk),
        resort_id=str(report.resort_id),
        source=report.source,
        observed_at=report.observed_at,
        fetched_at=report.fetched_at,
        base_cm=report.base_cm,
        new_24h_cm=report.new_24h_cm,
        forecast_72h_cm=report.forecast_72h_cm,
        temp_c=report.temp_c,
        lifts_open=report.lifts_open,
        lifts_total=report.lifts_total,
        runs_open=report.runs_open,
        runs_total=report.runs_total,
        status_text=report.status_text,
        reporter=_person_ref(report.reporter),
    )


def pass_record(row: LiftPass) -> PassRecord:
    return PassRecord(
        person_id=str(row.person_id),
        resort_id=str(row.resort_id) if row.resort_id else None,
        product=row.product,
        days=row.days,
        status=row.status,
        price=row.price,
        currency=row.currency,
    )


def gear_record(row: GearPlan) -> GearRecord:
    return GearRecord(
        person_id=str(row.person_id),
        item=row.item,
        mode=row.mode,
        price=row.price,
        currency=row.currency,
        note=row.note,
    )


def profile_record(row: SkiProfile) -> ProfileRecord:
    return ProfileRecord(
        person_id=str(row.person_id),
        discipline=row.discipline,
        level=row.level,
        boot_size_eu=row.boot_size_eu,
        height_cm=row.height_cm,
        weight_kg=row.weight_kg,
        share_sizes_with_trip=row.share_sizes_with_trip,
        owns_gear=row.owns_gear,
    )


def resort_data(resort: Resort) -> ResortData:
    return ResortData(
        id=str(resort.pk),
        slug=resort.slug,
        name=resort.name,
        country=resort.country,
        region=resort.region,
        lat=resort.lat,
        lng=resort.lng,
        base_elev_m=resort.base_elev_m,
        summit_elev_m=resort.summit_elev_m,
        website_url=resort.website_url,
    )


class DjangoSkiStore:
    """``SkiStore`` on the ORM."""

    def trip_info(self, trip_id: str) -> TripInfo | None:
        # Resolved through the app registry: ski never imports trips' models.
        trip = apps.get_model("trips", "Trip").objects.filter(pk=trip_id).first()
        if trip is None:
            return None
        return TripInfo(
            id=str(trip.pk),
            crew_id=str(trip.crew_id),
            type=trip.type,
            currency=trip.currency,
            timezone=trip.timezone,
            name=trip.name,
        )

    def trip_resorts(self, trip_id: str) -> list[TripResortData]:
        links = TripResort.objects.filter(trip_id=trip_id).select_related("resort")
        return [TripResortData(resort_data(t.resort), t.nights, t.position) for t in links]

    def latest_reports(self, resort_ids: list[str]) -> dict[str, ReportData]:
        latest = {}
        for resort_id in resort_ids:
            report = (
                SnowReport.objects.filter(resort_id=resort_id)
                .select_related("reporter")
                .order_by("-observed_at", "-fetched_at")
                .first()
            )
            if report is not None:
                latest[str(resort_id)] = report_data(report)
        return latest

    def manual_report_times(
        self, resort_id: str, reporter_id: str, since: datetime
    ) -> list[datetime]:
        return list(
            SnowReport.objects.filter(
                resort_id=resort_id,
                source=SnowReport.Source.MANUAL,
                reporter_id=reporter_id,
                fetched_at__gte=since,
            )
            .order_by("fetched_at")
            .values_list("fetched_at", flat=True)
        )

    def crew_member_ids(self, crew_id: str) -> set[str]:
        return set(active_member_ids(crew_id))

    def add_manual_report(
        self, resort_id: str, reporter_id: str, report: ManualReportInput, now: datetime
    ) -> ReportData:
        row = SnowReport.objects.create(
            resort_id=resort_id,
            source=SnowReport.Source.MANUAL,
            observed_at=now,
            fetched_at=now,
            reporter_id=reporter_id,
            **vars(report),
        )
        return report_data(SnowReport.objects.select_related("reporter").get(pk=row.pk))

    # --- API-side reads and writes ---------------------------------------------------------

    def list_resorts(self, country: str | None) -> list[ResortData]:
        resorts = Resort.objects.filter(active=True)
        if country:
            resorts = resorts.filter(country=country)
        return [resort_data(r) for r in resorts]

    def get_resort(self, resort_id: str) -> ResortData | None:
        resort = Resort.objects.filter(pk=resort_id, active=True).first()
        return resort_data(resort) if resort else None

    def add_trip_resort(self, trip_id: str, resort_id: str, nights: int | None) -> TripResortData:
        last = TripResort.objects.filter(trip_id=trip_id).aggregate(last=Max("position"))["last"]
        try:
            with transaction.atomic():
                link = TripResort.objects.create(
                    trip_id=trip_id,
                    resort_id=resort_id,
                    nights=nights,
                    position=0 if last is None else last + 1,
                )
        except IntegrityError as exc:
            raise ResortAlreadyAddedError(resort_id) from exc
        return TripResortData(resort_data(link.resort), link.nights, link.position)

    def update_trip_resort(
        self, trip_id: str, resort_id: str, changes: dict[str, int | None]
    ) -> TripResortData | None:
        link = (
            TripResort.objects.filter(trip_id=trip_id, resort_id=resort_id)
            .select_related("resort")
            .first()
        )
        if link is None:
            return None
        for field, value in changes.items():
            setattr(link, field, value)
        link.save()
        return TripResortData(resort_data(link.resort), link.nights, link.position)

    def remove_trip_resort(self, trip_id: str, resort_id: str) -> bool:
        deleted, _ = TripResort.objects.filter(trip_id=trip_id, resort_id=resort_id).delete()
        return bool(deleted)

    def recent_reports(self, resort_id: str, limit: int) -> list[ReportData]:
        reports = (
            SnowReport.objects.filter(resort_id=resort_id)
            .select_related("reporter")
            .order_by("-observed_at", "-fetched_at")[:limit]
        )
        return [report_data(r) for r in reports]

    def participants(self, trip_id: str) -> list[Participant]:
        return [
            Participant(p.person_id, p.display_name, p.rsvp) for p in trip_participants(trip_id)
        ]

    def passes(self, trip_id: str) -> list[PassRecord]:
        return [
            pass_record(p) for p in LiftPass.objects.filter(trip_id=trip_id).order_by("created_at")
        ]

    def upsert_pass(self, trip_id: str, person_id: str, item: PassInput) -> PassRecord:
        row, _ = LiftPass.objects.update_or_create(
            trip_id=trip_id,
            person_id=person_id,
            resort_id=item.resort_id,
            defaults={
                "product": item.product,
                "days": item.days,
                "status": item.status,
                "price": item.price,
                "currency": item.currency,
            },
        )
        return pass_record(row)

    def delete_pass(self, trip_id: str, person_id: str, resort_id: str | None) -> None:
        LiftPass.objects.filter(trip_id=trip_id, person_id=person_id, resort_id=resort_id).delete()

    def gear(self, trip_id: str) -> list[GearRecord]:
        rows = GearPlan.objects.filter(trip_id=trip_id).order_by("created_at", "item")
        return [gear_record(g) for g in rows]

    def replace_gear(
        self, trip_id: str, person_id: str, items: list[GearInput]
    ) -> list[GearRecord]:
        with transaction.atomic():
            GearPlan.objects.filter(trip_id=trip_id, person_id=person_id).delete()
            rows = GearPlan.objects.bulk_create(
                GearPlan(trip_id=trip_id, person_id=person_id, **vars(item)) for item in items
            )
        return [gear_record(g) for g in rows]

    def profiles(self, person_ids: list[str]) -> list[ProfileRecord]:
        return [profile_record(p) for p in SkiProfile.objects.filter(person_id__in=person_ids)]

    def get_profile(self, person_id: str) -> ProfileRecord | None:
        profile = SkiProfile.objects.filter(person_id=person_id).first()
        return profile_record(profile) if profile else None

    def save_profile(self, person_id: str, profile: ProfileInput) -> ProfileRecord:
        row, _ = SkiProfile.objects.update_or_create(person_id=person_id, defaults=vars(profile))
        return profile_record(row)
