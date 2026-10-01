from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from crews.domain import CrewSummary
from crews.models import Crew, CrewMembership, Invite, WhatsAppGroupLink


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
