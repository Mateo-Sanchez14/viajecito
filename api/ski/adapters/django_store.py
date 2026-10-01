"""Django persistence adapter of the ski ports."""

from datetime import datetime, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q

from ski import domain
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
