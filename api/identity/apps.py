from django.apps import AppConfig


class IdentityConfig(AppConfig):
    name = "identity"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from identity import ports
        from identity.adapters.django_repos import DjangoIdentityDirectory

        ports.set_default_directory(DjangoIdentityDirectory)
