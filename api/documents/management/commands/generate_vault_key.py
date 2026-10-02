from cryptography.fernet import Fernet
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Generate a new DOCUMENTS_FERNET_KEYS key; store it outside the repository."

    def handle(self, *args, **options):
        self.stdout.write(Fernet.generate_key().decode())
