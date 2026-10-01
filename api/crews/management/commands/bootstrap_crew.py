from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from crews.adapters.django_store import DjangoCrewStore
from crews.domain import InvalidCrewInputError
from crews.use_cases.bootstrap_crew import bootstrap_crew
from shared.phone import InvalidPhoneError


class Command(BaseCommand):
    help = "Create a crew with its WhatsApp group link and admin (idempotent per chat id)."

    def add_arguments(self, parser):
        parser.add_argument("--name", required=True)
        parser.add_argument("--chat-id", required=True, help="WhatsApp group id ending in @g.us")
        parser.add_argument("--admin-phone", required=True)

    def handle(self, *args, **options):
        try:
            with transaction.atomic():
                result = bootstrap_crew(
                    options["name"], options["chat_id"], options["admin_phone"], DjangoCrewStore()
                )
        except (InvalidCrewInputError, InvalidPhoneError) as exc:
            raise CommandError(str(exc)) from exc
        verb = "created" if result.created else "already exists (nothing changed)"
        self.stdout.write(f"Crew {result.crew_id} {verb}")
