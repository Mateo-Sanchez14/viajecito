from django.apps import AppConfig


class LinkpreviewConfig(AppConfig):
    name = "linkpreview"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from linkpreview import ports
        from linkpreview.adapters import wiring
        from linkpreview.use_cases.retry_pending import retry_pending
        from messaging import reminders

        ports.set_defaults(wiring.build_store, wiring.build_fetcher, wiring.build_scheduler)
        reminders.register_tick_job("linkpreview.retry_pending", retry_pending)
