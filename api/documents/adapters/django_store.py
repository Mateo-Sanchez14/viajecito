from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import F

from documents.domain import DocumentError
from documents.models import Document, VaultQuota


class DjangoDocumentStore:
    def atomic(self):
        return transaction.atomic()

    def create(self, trip_id, person_id, data, mime, name, digest, fields, quota):
        counter, _ = VaultQuota.objects.get_or_create(trip_id=trip_id)
        counter = VaultQuota.objects.select_for_update().get(pk=counter.pk)
        if counter.plaintext_bytes + len(data) > quota:
            raise DocumentError("quota_exceeded", "Trip storage quota exceeded")
        row = Document(
            trip_id=trip_id,
            uploader_id=person_id,
            owner_id=person_id,
            mime=mime,
            size=len(data),
            original_name=name,
            sha256=digest,
            **fields,
        )
        stored = None
        try:
            row.file.save(name, ContentFile(data), save=False)
            stored = row.file.name
            row.save()
            VaultQuota.objects.filter(pk=counter.pk).update(
                plaintext_bytes=F("plaintext_bytes") + len(data)
            )
        except BaseException:
            if stored:
                row.file.storage.delete(stored)
            raise
        return row

    def delete(self, row):
        with transaction.atomic():
            counter = VaultQuota.objects.select_for_update().get(pk=row.trip_id)
            name = row.file.name
            storage = row.file.storage
            counter.plaintext_bytes = max(0, counter.plaintext_bytes - row.size)
            counter.save()
            row.delete()
            transaction.on_commit(lambda: storage.delete(name))
