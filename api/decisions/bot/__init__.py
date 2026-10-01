def register() -> None:
    """Register every bot contribution of the app (idempotent); called from ``ready()``."""
    from decisions.bot import missing_votes, subcommands

    subcommands.register()
    missing_votes.register()
