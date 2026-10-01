from django.apps import AppConfig


class ItineraryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "itinerary"

    def ready(self):
        from itinerary.adapters.django_store import DjangoStore
        from itinerary.ports import configure

        configure(DjangoStore)
