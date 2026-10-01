from django.apps import AppConfig


class ProposalsConfig(AppConfig):
    name = "proposals"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        """Register everything this app contributes through the core registries."""
        from messaging import reminders, router
        from messaging.handlers import commands
        from proposals.adapters.preview_events import on_preview_fetched
        from proposals.adapters.rules import majority_rule
        from proposals.bot import link_capture, quoted_card, subcommands
        from proposals.copy import es_ar
        from shared import events

        router.register_handler(20, quoted_card.handle)
        router.register_handler(30, link_capture.handle)
        commands.register_subcommand(
            "propuestas", subcommands.propuestas, help_line=es_ar.HELP_PROPUESTAS
        )
        reminders.register_reminder_rule("proposals.majority", majority_rule)
        events.subscribe("linkpreview.preview_fetched", on_preview_fetched)
