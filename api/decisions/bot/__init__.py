def register() -> None:
    """Register every bot contribution of the app (idempotent); called from ``ready()``."""
    from decisions.bot import subcommands

    subcommands.register()
