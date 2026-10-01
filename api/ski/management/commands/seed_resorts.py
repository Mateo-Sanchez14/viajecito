from django.core.management.base import BaseCommand

from ski.models import Resort
from ski.seed import load_resorts


class Command(BaseCommand):
    help = "Upsert the seeded ski resorts (Chile and Argentina) by slug. Safe to run repeatedly."

    def handle(self, *args, **options):
        created, updated = load_resorts(Resort)
        self.stdout.write(f"resorts: {created} created, {updated} updated")
