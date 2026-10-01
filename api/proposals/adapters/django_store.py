from collections.abc import Collection
from contextlib import AbstractContextManager
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Count

from proposals.domain.types import (
    CommentRecord,
    NewProposal,
    PreviewSummary,
    ProposalRecord,
    TripRef,
)
from proposals.models import Comment, Proposal, Vote
from proposals.ports import DuplicateProposalError

_TRIP_MODEL = Proposal._meta.get_field("trip").related_model  # core model, reached via our FK


def preview_summary(row) -> PreviewSummary | None:
    if row is None:
        return None
    return PreviewSummary(
        id=str(row.pk),
        url=row.url,
        final_url=row.final_url,
        canonical_url=row.canonical_url,
        site_name=row.site_name,
        title=row.title,
        description=row.description,
        image_url=row.image_url,
        has_thumbnail=bool(row.thumb_file),
        price_amount=row.price_amount,
        price_currency=row.price_currency,
        lat=float(row.lat) if row.lat is not None else None,
        lng=float(row.lng) if row.lng is not None else None,
        fetch_status=row.fetch_status,
        fetched_at=row.fetched_at,
    )


def record(row: Proposal) -> ProposalRecord:
    return ProposalRecord(
        id=str(row.pk),
        trip_id=str(row.trip_id),
        crew_id=str(row.trip.crew_id),
        author_id=str(row.author_id),
        category=row.category,
        status=row.status,
        title=row.title,
        note=row.note,
        canonical_url=row.canonical_url,
        est_price=row.est_price,
        price_basis=row.price_basis,
        currency=row.currency,
        starts_on=row.starts_on,
        ends_on=row.ends_on,
        booking_ref=row.booking_ref,
        chosen_at=row.chosen_at,
        booked_at=row.booked_at,
        discarded_at=row.discarded_at,
        classified_by=row.classified_by,
        source_message_id=row.source_message_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        preview=preview_summary(row.link_preview),
        comment_count=getattr(row, "comment_total", None) or 0,
    )


def comment_record(row: Comment) -> CommentRecord:
    return CommentRecord(
        id=str(row.pk),
        proposal_id=str(row.proposal_id),
        author_id=str(row.author_id),
        body=row.body,
        source_message_id=row.source_message_id,
        created_at=row.created_at,
    )


def _queryset():
    return Proposal.objects.select_related("trip", "link_preview").annotate(
        comment_total=Count("comments", distinct=True)
    )


class DjangoProposalStore:
    def atomic(self) -> AbstractContextManager[None]:
        return transaction.atomic()

    def trip_ref(self, trip_id: str) -> TripRef | None:
        trip = _TRIP_MODEL.objects.filter(pk=trip_id).first()
        if trip is None:
            return None
        return TripRef(
            id=str(trip.pk), crew_id=str(trip.crew_id), currency=trip.currency, status=trip.status
        )

    def create(self, new: NewProposal) -> ProposalRecord:
        try:
            with transaction.atomic():
                row = Proposal.objects.create(
                    trip_id=new.trip_id,
                    author_id=new.author_id,
                    title=new.title,
                    category=new.category,
                    classified_by=new.classified_by,
                    note=new.note,
                    link_preview_id=new.link_preview_id,
                    canonical_url=new.canonical_url,
                    est_price=new.est_price,
                    price_basis=new.price_basis,
                    currency=new.currency,
                    starts_on=new.starts_on,
                    ends_on=new.ends_on,
                    source_message_id=new.source_message_id,
                )
        except IntegrityError as exc:
            existing = (
                self.find_by_canonical(new.trip_id, new.canonical_url)
                if new.canonical_url
                else None
            )
            if existing is None:
                raise
            raise DuplicateProposalError(existing.id) from exc
        return record(_queryset().get(pk=row.pk))

    def get(self, proposal_id: str) -> ProposalRecord | None:
        row = _queryset().filter(pk=proposal_id).first()
        return record(row) if row else None

    def find_by_canonical(self, trip_id: str, canonical_url: str) -> ProposalRecord | None:
        row = _queryset().filter(trip_id=trip_id, canonical_url=canonical_url).first()
        return record(row) if row else None

    def list_for_trip(
        self,
        trip_id: str,
        *,
        categories: Collection[str] | None = None,
        statuses: Collection[str] | None = None,
    ) -> list[ProposalRecord]:
        rows = _queryset().filter(trip_id=trip_id)
        if categories:
            rows = rows.filter(category__in=categories)
        if statuses is not None:
            rows = rows.filter(status__in=statuses)
        return [record(row) for row in rows.order_by("-created_at", "-pk")[:500]]

    def update(self, proposal_id: str, changes: dict[str, Any]) -> ProposalRecord:
        row = Proposal.objects.get(pk=proposal_id)
        for field, value in changes.items():
            setattr(row, field, value)
        row.save(update_fields=[*changes, "updated_at"])
        return record(_queryset().get(pk=proposal_id))

    def votes_for(self, proposal_ids: list[str]) -> dict[str, list[tuple[str, int]]]:
        grouped: dict[str, list[tuple[str, int]]] = {pid: [] for pid in proposal_ids}
        rows = Vote.objects.filter(proposal_id__in=proposal_ids).values_list(
            "proposal_id", "person_id", "value"
        )
        for proposal_id, person_id, value in rows:
            grouped[str(proposal_id)].append((str(person_id), value))
        return grouped

    def set_vote(
        self, proposal_id: str, person_id: str, value: int, source_message_id: int | None
    ) -> None:
        Vote.objects.update_or_create(
            proposal_id=proposal_id,
            person_id=person_id,
            defaults={"value": value, "source_message_id": source_message_id},
        )

    def delete_vote(self, proposal_id: str, person_id: str) -> None:
        Vote.objects.filter(proposal_id=proposal_id, person_id=person_id).delete()

    def has_voted(self, proposal_id: str, person_id: str) -> bool:
        return Vote.objects.filter(proposal_id=proposal_id, person_id=person_id).exists()

    def add_comment(
        self, proposal_id: str, author_id: str, body: str, source_message_id: int | None
    ) -> CommentRecord:
        row = Comment.objects.create(
            proposal_id=proposal_id,
            author_id=author_id,
            body=body,
            source_message_id=source_message_id,
        )
        return comment_record(row)

    def get_comment(self, comment_id: str) -> tuple[CommentRecord, str] | None:
        row = Comment.objects.select_related("proposal").filter(pk=comment_id).first()
        return (comment_record(row), str(row.proposal.trip_id)) if row else None

    def delete_comment(self, comment_id: str) -> None:
        Comment.objects.filter(pk=comment_id).delete()

    def list_comments(self, proposal_id: str) -> list[CommentRecord]:
        rows = Comment.objects.filter(proposal_id=proposal_id).order_by("created_at", "pk")[:500]
        return [comment_record(row) for row in rows]

    def proposals_of_preview(self, preview_id: str) -> list[ProposalRecord]:
        return [record(row) for row in _queryset().filter(link_preview_id=preview_id)]

    def read_thumbnail(self, proposal_id: str) -> bytes | None:
        row = Proposal.objects.select_related("link_preview").filter(pk=proposal_id).first()
        preview = row.link_preview if row else None
        if preview is None or not preview.thumb_file:
            return None
        try:
            with preview.thumb_file.open("rb") as handle:
                return handle.read()
        except FileNotFoundError:
            return None
