from django.apps import AppConfig


class TripsConfig(AppConfig):
    name = "trips"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from trips import plugins, ports
        from trips.adapters.django_store import DjangoTripStore

        ports.set_default_store(DjangoTripStore)
        plugins.register(plugins.GENERIC)
