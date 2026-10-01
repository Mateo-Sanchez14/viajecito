import uuid
from datetime import datetime

from django.db import IntegrityError, transaction
from django.db.models import F

from identity.domain import OtpState, PersonData, phone_to_jid
from identity.models import OtpChallenge, Person, WhatsAppIdentity


class DjangoOtpChallengeRepository:
    def created_times(
        self, since: datetime, *, phone: str | None = None, ip: str | None = None
    ) -> list[datetime]:
        rows = OtpChallenge.objects.filter(created_at__gt=since)
        if phone is not None:
            rows = rows.filter(phone=phone)
        if ip is not None:
            rows = rows.filter(ip=ip)
        return list(rows.values_list("created_at", flat=True))

    def add_replacing_live(
        self,
        *,
        phone: str,
        code_hmac: str,
        expires_at: datetime,
        max_attempts: int,
        ip: str,
        eligible: bool,
        now: datetime,
    ) -> None:
        with transaction.atomic():
            OtpChallenge.objects.filter(phone=phone, consumed_at__isnull=True).update(
                consumed_at=now
            )
            OtpChallenge.objects.create(
                phone=phone,
                code_hmac=code_hmac,
                expires_at=expires_at,
                max_attempts=max_attempts,
                ip=ip,
                eligible=eligible,
                created_at=now,
            )

    def latest_live(self, phone: str) -> tuple[int, OtpState] | None:
        row = (
            OtpChallenge.objects.filter(phone=phone, consumed_at__isnull=True)
            .order_by("-created_at", "-id")
            .first()
        )
        if row is None:
            return None
        return row.pk, OtpState(
            code_hmac=row.code_hmac,
            expires_at=row.expires_at,
            attempts=row.attempts,
            max_attempts=row.max_attempts,
            consumed_at=row.consumed_at,
            eligible=row.eligible,
        )

    def reserve_attempt(self, challenge_id: int) -> bool:
        return (
            OtpChallenge.objects.filter(
                pk=challenge_id, consumed_at__isnull=True, attempts__lt=F("max_attempts")
            ).update(attempts=F("attempts") + 1)
            == 1
        )

    def consume(self, challenge_id: int, now: datetime) -> bool:
        return (
            OtpChallenge.objects.filter(pk=challenge_id, consumed_at__isnull=True).update(
                consumed_at=now
            )
            == 1
        )


class DjangoPersonProvisioner:
    def get_or_create(self, phone: str) -> PersonData:
        try:
            with transaction.atomic():
                person = Person.objects.filter(phone=phone).first() or Person.objects.create_user(
                    phone
                )
        except IntegrityError:  # concurrent first login of the same phone
            person = Person.objects.get(phone=phone)
        WhatsAppIdentity.objects.get_or_create(person=person, jid=phone_to_jid(phone))
        return person_data(person)


def person_data(person: Person) -> PersonData:
    return PersonData(
        id=str(person.pk),
        phone=person.phone,
        display_name=person.display_name,
        locale=person.locale,
    )


class DjangoIdentityDirectory:
    def person_id_by_jid(self, jid: str) -> str | None:
        return self._first(WhatsAppIdentity.objects.filter(jid=jid))

    def person_id_by_lid(self, lid: str) -> str | None:
        return self._first(WhatsAppIdentity.objects.filter(lid=lid))

    def people_by_ids(self, person_ids: list[str]) -> list[PersonData]:
        valid = []
        for raw in person_ids:
            try:
                valid.append(uuid.UUID(str(raw)))
            except ValueError:
                continue  # not an id: simply unknown
        return [person_data(p) for p in Person.objects.filter(pk__in=valid)]

    @staticmethod
    def _first(rows) -> str | None:
        person_id = rows.values_list("person_id", flat=True).first()
        return str(person_id) if person_id else None
