from django.apps import AppConfig


class TripsConfig(AppConfig):
    name = "trips"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from trips import plugins

        plugins.register(plugins.GENERIC)
