from datetime import datetime

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from crews.domain import CrewSummary
from crews.models import Crew, CrewMembership, Invite, WhatsAppGroupLink
from shared.phone import phone_to_jid


class DjangoCrewStore:
    def find_crew_id_by_chat_id(self, chat_id: str) -> str | None:
        link = WhatsAppGroupLink.objects.filter(chat_id=chat_id).first()
        return str(link.crew_id) if link else None

    def create_crew(self, name: str, chat_id: str) -> str:
        crew = Crew.objects.create(name=name)
        WhatsAppGroupLink.objects.create(crew=crew, chat_id=chat_id)
        return str(crew.pk)

    def ensure_admin(self, crew_id: str, phone: str) -> None:
        person_model = get_user_model()
        person = person_model.objects.filter(phone=phone).first()
        if person is None:
            person = person_model.objects.create_user(phone)
        CrewMembership.objects.update_or_create(
            crew_id=crew_id,
            person=person,
            defaults={"role": "admin", "source": "bootstrap", "status": "active"},
        )
        # Give the admin a WhatsApp identity so their first message resolves without a roster
        # sync. Resolved by label to keep crews free of an import on identity; an existing
        # identity is never touched.
        identity_model = apps.get_model("identity", "WhatsAppIdentity")
        jid = phone_to_jid(phone)
        if not identity_model.objects.filter(Q(person=person) | Q(jid=jid)).exists():
            identity_model.objects.create(person=person, jid=jid)

    def phone_has_membership_or_invite(self, phone: str) -> bool:
        has_membership = CrewMembership.objects.filter(
            person__phone=phone, status=CrewMembership.Status.ACTIVE
        ).exists()
        pending = Invite.objects.filter(
            phone=phone, accepted_at__isnull=True, cancelled_at__isnull=True
        )
        return has_membership or pending.exists()

    def summaries_for(self, person_id: str) -> list[CrewSummary]:
        memberships = (
            CrewMembership.objects.filter(person_id=person_id, status=CrewMembership.Status.ACTIVE)
            .select_related("crew")
            .order_by("crew__name")
        )
        return [
            CrewSummary(
                id=str(m.crew_id),
                name=m.crew.name,
                role=m.role,
                gastito_group_url=m.crew.gastito_group_url,
                default_trip_id=None,
            )
            for m in memberships
        ]

    def accept_pending_invites(self, person_id: str, phone: str) -> int:
        accepted = 0
        with transaction.atomic():
            for invite in Invite.objects.select_for_update().filter(
                phone=phone, accepted_at__isnull=True, cancelled_at__isnull=True
            ):
                membership, created = CrewMembership.objects.get_or_create(
                    crew_id=invite.crew_id,
                    person_id=person_id,
                    defaults={"role": "member", "source": "invite"},
                )
                if not created and membership.status != CrewMembership.Status.ACTIVE:
                    membership.status = CrewMembership.Status.ACTIVE
                    membership.save(update_fields=["status"])
                invite.accepted_at = timezone.now()
                invite.save(update_fields=["accepted_at"])
                accepted += 1
        return accepted

    def is_active_member(self, crew_id: str, person_id: str) -> bool:
        return CrewMembership.objects.filter(
            crew_id=crew_id, person_id=person_id, status=CrewMembership.Status.ACTIVE
        ).exists()

    def roster_last_synced_at(self, crew_id: str) -> datetime | None:
        return (
            WhatsAppGroupLink.objects.filter(crew_id=crew_id)
            .values_list("last_synced_at", flat=True)
            .first()
        )

    def chat_id_for_crew(self, crew_id: str) -> str | None:
        link = WhatsAppGroupLink.objects.filter(crew_id=crew_id).first()
        return link.chat_id if link else None

    def upsert_roster_member(
        self, crew_id: str, *, phone: str, lid: str | None, display_name: str
    ) -> bool:
        person_model = get_user_model()
        # The identity model belongs to the identity app; resolving it by label keeps crews free
        # of an import on it (and of the dependency cycle that would create).
        identity_model = apps.get_model("identity", "WhatsAppIdentity")
        with transaction.atomic():
            person = person_model.objects.filter(phone=phone).first()
            if person is None:
                person = person_model.objects.create_user(phone, display_name=display_name)
            identity, _ = identity_model.objects.get_or_create(
                jid=phone_to_jid(phone), defaults={"person": person}
            )
            lid_is_free = lid and not identity_model.objects.filter(lid=lid).exists()
            if identity.person_id == person.pk and not identity.lid and lid_is_free:
                identity.lid = lid
                identity.save(update_fields=["lid"])
            _, created = CrewMembership.objects.get_or_create(
                crew_id=crew_id,
                person=person,
                defaults={"role": "member", "source": "group_sync", "status": "active"},
            )
        return created

    def mark_roster_synced(self, crew_id: str, when: datetime) -> None:
        WhatsAppGroupLink.objects.filter(crew_id=crew_id).update(last_synced_at=when)

    def crews_needing_sync(self, before: datetime) -> list[str]:
        links = WhatsAppGroupLink.objects.filter(
            Q(last_synced_at__isnull=True) | Q(last_synced_at__lt=before)
        ).order_by("last_synced_at", "pk")
        return [str(crew_id) for crew_id in links.values_list("crew_id", flat=True)]
