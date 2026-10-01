from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    name = "notifications"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from notifications.adapters import wiring

        wiring.install()
