from django.apps import AppConfig


class SkiConfig(AppConfig):
    name = "ski"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
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
