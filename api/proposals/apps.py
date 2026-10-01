from django.apps import AppConfig


class ProposalsConfig(AppConfig):
    name = "proposals"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from proposals.adapters.preview_events import on_preview_fetched
        from shared import events

        events.subscribe("linkpreview.preview_fetched", on_preview_fetched)
