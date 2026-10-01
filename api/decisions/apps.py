from django.apps import AppConfig


class DecisionsConfig(AppConfig):
    name = "decisions"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from decisions import bot

        bot.register()
