from django.apps import AppConfig


class LogisticsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "logistics"

    def ready(self):
        from logistics.bot.subcommands import listo, tareas
        from logistics.copy.es_ar import HELP_LISTO, HELP_TAREAS
        from logistics.reminders import digest_section, on_queued, task_nag
        from logistics.subscribers import on_proposal_status_changed
        from messaging.handlers.commands import register_subcommand
        from messaging.reminders import register_digest_section, register_reminder_rule
        from shared.events import subscribe

        subscribe("proposal.status_changed", on_proposal_status_changed)
        register_subcommand("tareas", tareas, help_line=HELP_TAREAS)
        register_subcommand("listo", listo, aliases=("hecho",), help_line=HELP_LISTO)
        register_reminder_rule("logistics.task_nag", task_nag, on_queued=on_queued)
        register_digest_section("logistics.tasks", digest_section, order=30)
