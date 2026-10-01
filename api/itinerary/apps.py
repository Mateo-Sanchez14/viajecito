from django.apps import AppConfig


class ItineraryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "itinerary"

    def ready(self):
        from itinerary.adapters.django_store import DjangoStore
        from itinerary.ports import configure

        configure(DjangoStore)
        from itinerary.use_cases.proposal_changed import on_proposal_status_changed
        from shared.events import subscribe

        subscribe("proposal.status_changed", on_proposal_status_changed)
