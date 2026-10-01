"""Django adapter. Each write renumbers affected buckets atomically."""

from dataclasses import replace

from django.db import transaction

from itinerary.domain import DayData, EntryData, ItineraryError, NoteData, order_entries
from itinerary.models import ItineraryDay, ItineraryEntry, Note


def entry_data(row):
    return EntryData(
        str(row.id),
        str(row.trip_id),
        row.day.date if row.day_id else None,
        row.starts_at,
        row.ends_at,
        row.kind,
        row.title,
        row.location_label,
        float(row.lat) if row.lat is not None else None,
        float(row.lng) if row.lng is not None else None,
        row.is_meeting_point,
        str(row.proposal_id) if row.proposal_id else None,
        row.source,
        row.position,
        row.notes,
        row.created_at,
    )


def note_data(row):
    return NoteData(
        str(row.id), str(row.trip_id), str(row.author_id), row.body, row.pinned, row.created_at
    )


def bucket(trip_id, day_id):
    return ItineraryEntry.objects.filter(trip_id=trip_id, day_id=day_id).select_related("day")


def renumber(trip_id, day_id):
    for position, entry in enumerate(
        order_entries([entry_data(e) for e in bucket(trip_id, day_id)])
    ):
        ItineraryEntry.objects.filter(pk=entry.id).update(position=position)


class DjangoStore:
    def entries(self, trip_id):
        return [
            entry_data(e)
            for e in ItineraryEntry.objects.filter(trip_id=trip_id).select_related("day")
        ]

    def days(self, trip_id):
        return [
            DayData(d.date, d.title, d.notes, False)
            for d in ItineraryDay.objects.filter(trip_id=trip_id)
        ]

    def notes(self, trip_id):
        return [
            note_data(n)
            for n in Note.objects.filter(trip_id=trip_id).order_by("-pinned", "-created_at", "id")
        ]

    def get_entry(self, entry_id):
        e = ItineraryEntry.objects.filter(pk=entry_id).select_related("day").first()
        return entry_data(e) if e else None

    def get_note(self, note_id):
        n = Note.objects.filter(pk=note_id).first()
        return note_data(n) if n else None

    @transaction.atomic
    def save_day(self, trip_id, day, fields):
        row, _ = ItineraryDay.objects.update_or_create(trip_id=trip_id, date=day, defaults=fields)
        entries = order_entries([entry_data(e) for e in bucket(trip_id, row.id)])
        return DayData(row.date, row.title, row.notes, False, entries)

    @transaction.atomic
    def save_entry(self, trip_id, actor_id, fields, entry_id=None):
        fields = fields.copy()
        day = fields.pop("day_date")
        day_row = ItineraryDay.objects.get_or_create(trip_id=trip_id, date=day)[0] if day else None
        fields["day"] = day_row
        old_day = None
        if entry_id:
            row = ItineraryEntry.objects.get(pk=entry_id)
            old_day = row.day_id
            if old_day != (day_row.id if day_row else None):
                fields["position"] = bucket(trip_id, day_row.id if day_row else None).count()
            for key, value in fields.items():
                setattr(row, key, value)
            row.save()
        else:
            row = ItineraryEntry.objects.create(
                trip_id=trip_id,
                created_by_id=actor_id,
                position=bucket(trip_id, day_row.id if day_row else None).count(),
                **fields,
            )
        renumber(trip_id, row.day_id)
        if entry_id and old_day != row.day_id:
            renumber(trip_id, old_day)
        row.refresh_from_db()
        return entry_data(row)

    @transaction.atomic
    def move_entry(self, entry_id, direction):
        row = ItineraryEntry.objects.select_related("day").get(pk=entry_id)
        ordered = order_entries([entry_data(e) for e in bucket(row.trip_id, row.day_id)])
        index = next(i for i, e in enumerate(ordered) if e.id == str(row.id))
        target = index + (-1 if direction == "up" else 1)
        if not 0 <= target < len(ordered):
            raise ItineraryError("at_edge", 409)
        if ordered[index].starts_at != ordered[target].starts_at:
            raise ItineraryError("cannot_reorder_timed", 409)
        ordered[index], ordered[target] = ordered[target], ordered[index]
        for position, item in enumerate(ordered):
            ItineraryEntry.objects.filter(pk=item.id).update(position=position)
        entries = [replace(item, position=i) for i, item in enumerate(ordered)]
        day = row.day
        return DayData(
            day.date if day else None,
            day.title if day else "",
            day.notes if day else "",
            False,
            entries,
        )

    @transaction.atomic
    def delete_entry(self, entry_id):
        row = ItineraryEntry.objects.get(pk=entry_id)
        trip_id, day_id = row.trip_id, row.day_id
        row.delete()
        renumber(trip_id, day_id)

    @transaction.atomic
    def save_note(self, trip_id, actor_id, fields, note_id=None):
        pinned = Note.objects.filter(trip_id=trip_id, pinned=True)
        if note_id:
            pinned = pinned.exclude(pk=note_id)
        if fields["pinned"] and pinned.count() >= 5:
            raise ItineraryError("too_many_pinned", 409)
        if note_id:
            row = Note.objects.get(pk=note_id)
            for key, value in fields.items():
                setattr(row, key, value)
            row.save()
        else:
            row = Note.objects.create(trip_id=trip_id, author_id=actor_id, **fields)
        return note_data(row)

    def delete_note(self, note_id):
        Note.objects.filter(pk=note_id).delete()
