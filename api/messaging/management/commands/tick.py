import json

from django.core.management.base import BaseCommand

from messaging.adapters.tick_wiring import run_default_tick


class Command(BaseCommand):
    help = (
        "Periodic housekeeping (run every minute): unstick and reprocess inbound messages, "
        "queue due trip reminders, deliver queued outbound messages and refresh stale group "
        "rosters."
    )

    def handle(self, *args, **options):
        summary = run_default_tick()
        if summary is None:  # another tick is running; stay silent
            return
        self.stdout.write(json.dumps(summary, separators=(",", ":")))
