# Logistics

Tasks are crew-member scoped. TaskSequence holds a per-trip high-water mark under an atomic write:
removing the highest numbered task or all tasks never reuses human command handles. SQLite uses the
project's IMMEDIATE transaction configuration; other databases lock the sequence row. Task status and
nudge-reset rules live in the pure domain and use cases; persistence lives in adapters.

Verification: `uv run pytest logistics`; full suite and import contracts are required at integration.
