from django.apps import AppConfig


class SkiConfig(AppConfig):
    name = "ski"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from messaging import reminders
        from messaging.handlers.commands import register_subcommand
        from ski.adapters.wiring import snow_refresh_job
        from ski.bot import digest, subcommands
        from trips import plugins

        generic = plugins.get("generic")
        plugins.register(
            plugins.TripTypePlugin(
                key="ski",
                label_key="trips.types.ski",
                modules=generic.modules + ("ski",),
                packing_templates=("ski", "border"),
                reminder_rules=("ski.snow_refresh",),
            )
        )

        reminders.register_tick_job("ski.snow_refresh", snow_refresh_job)
        reminders.register_digest_section("ski.snow", digest.snow_section, order=digest.ORDER)
        register_subcommand("nieve", subcommands.nieve, help_line=subcommands.HELP_LINE)
