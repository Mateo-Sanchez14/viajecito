from contextlib import AbstractContextManager
from datetime import date, datetime
from typing import Any

from django.db import IntegrityError, transaction

from decisions.domain.rules import DecisionAlreadyOpenError, DecisionData
from decisions.models import AvailabilityResponse, Decision


def decision_data(row: Decision) -> DecisionData:
    return DecisionData(
        id=str(row.pk),
        trip_id=str(row.trip_id),
        kind=row.kind,
        status=row.status,
        window_start=row.window_start,
        window_end=row.window_end,
        min_days=row.min_days,
        max_days=row.max_days,
        maybe_weight=row.maybe_weight,
        deadline=row.deadline,
        outcome_start=row.outcome_start,
        outcome_end=row.outcome_end,
        opened_by=str(row.opened_by_id),
        closed_by=str(row.closed_by_id) if row.closed_by_id else None,
        closed_at=row.closed_at,
        created_at=row.created_at,
    )


class DjangoDecisionStore:
    def atomic(self) -> AbstractContextManager[None]:
        return transaction.atomic()

    def create(self, trip_id: str, opened_by: str, fields: dict[str, Any]) -> DecisionData:
        try:
            with transaction.atomic():
                row = Decision.objects.create(trip_id=trip_id, opened_by_id=opened_by, **fields)
        except IntegrityError as exc:
            raise DecisionAlreadyOpenError("the trip already has an open dates decision") from exc
        return decision_data(row)

    def get(self, decision_id: str, *, for_update: bool = False) -> DecisionData | None:
        rows = Decision.objects.select_for_update() if for_update else Decision.objects
        row = rows.filter(pk=decision_id).first()
        return decision_data(row) if row else None

    def list_for_trip(self, trip_id: str, status: str | None) -> list[DecisionData]:
        rows = Decision.objects.filter(trip_id=trip_id)
        if status:
            rows = rows.filter(status=status)
        return [decision_data(r) for r in rows.order_by("-created_at", "-id")]

    def open_dates_for_trip(self, trip_id: str) -> DecisionData | None:
        row = Decision.objects.filter(
            trip_id=trip_id, kind=Decision.Kind.DATES, status=Decision.Status.OPEN
        ).first()
        return decision_data(row) if row else None

    def update(self, decision_id: str, changes: dict[str, Any]) -> DecisionData:
        row = Decision.objects.get(pk=decision_id)
        for field, value in changes.items():
            setattr(row, field, value)
        row.save()
        return decision_data(row)

    def close(
        self, decision_id: str, closed_by: str, start_on: date, end_on: date, closed_at: datetime
    ) -> DecisionData:
        row = Decision.objects.get(pk=decision_id)
        row.status = Decision.Status.CLOSED
        row.outcome_start, row.outcome_end = start_on, end_on
        row.closed_by_id, row.closed_at = closed_by, closed_at
        row.save()
        return decision_data(row)

    def reopen(self, decision_id: str) -> DecisionData:
        row = Decision.objects.get(pk=decision_id)
        row.status = Decision.Status.OPEN
        row.outcome_start = row.outcome_end = row.closed_by_id = row.closed_at = None
        try:
            with transaction.atomic():
                row.save()
        except IntegrityError as exc:
            raise DecisionAlreadyOpenError("the trip already has an open dates decision") from exc
        return decision_data(row)

    def answers(
        self, trip_id: str, start: date, end: date, person_ids: list[str]
    ) -> dict[tuple[str, date], str]:
        rows = AvailabilityResponse.objects.filter(
            trip_id=trip_id, date__gte=start, date__lte=end, person_id__in=person_ids
        ).values_list("person_id", "date", "answer")
        return {(str(person), day): answer for person, day, answer in rows}

    def apply_answers(self, trip_id: str, person_id: str, changes: dict[date, str | None]) -> None:
        with transaction.atomic():
            cleared = [day for day, answer in changes.items() if answer is None]
            if cleared:
                AvailabilityResponse.objects.filter(
                    trip_id=trip_id, person_id=person_id, date__in=cleared
                ).delete()
            for day, answer in changes.items():
                if answer is not None:
                    AvailabilityResponse.objects.update_or_create(
                        trip_id=trip_id, person_id=person_id, date=day, defaults={"answer": answer}
                    )
