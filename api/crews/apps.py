from django.apps import AppConfig


class CrewsConfig(AppConfig):
    name = "crews"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from crews import ports
        from crews.adapters.django_store import DjangoCrewStore

        ports.set_default_store(DjangoCrewStore)
