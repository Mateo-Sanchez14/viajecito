"""Django persistence adapter of the ski ports."""

from datetime import datetime, timedelta
from decimal import Decimal

from django.apps import apps
from django.db import transaction
from django.db.models import Q

from ski import domain
from ski.domain import (
    ManualReportInput,
    PersonRef,
    ReportData,
    ResortData,
    TripInfo,
    TripResortData,
)
from ski.models import Resort, SnowFetchState, SnowReport, TripResort
from ski.ports import FetchState, RefreshCandidate, ResortRef, SnowReading


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
    return PersonRef(str(person.pk), person.display_name or person.phone)


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

    def count_manual_reports(self, resort_id: str, since: datetime) -> int:
        return SnowReport.objects.filter(
            resort_id=resort_id, source=SnowReport.Source.MANUAL, fetched_at__gte=since
        ).count()

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
