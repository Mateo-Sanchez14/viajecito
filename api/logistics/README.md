# Logistics

Tasks are crew-member scoped. TaskSequence holds a per-trip high-water mark under an atomic write:
removing the highest numbered task or all tasks never reuses human command handles. SQLite uses the
project's IMMEDIATE transaction configuration; other databases lock the sequence row. Task status and
nudge-reset rules live in the pure domain and use cases; persistence lives in adapters.

Verification: `uv run pytest logistics`; full suite and import contracts are required at integration.

Packing templates are code/versioned; labels live in copy/es_ar.py. Generic is always available, plugin
packing_templates supply extras, and border is opt-in. Applied templates are remembered separately from
entries so deleting a list does not silently change the applied-state metadata. Apply is idempotent and
does not overwrite user edits.

Proposal status events synchronously update a single booking task per proposal. The transaction rolls
back together with its publisher if a subscriber fails. Tasks are completed by the bot without changing
the proposal's reservation state. A grouped reminder is read-only until the core reserves its deduped
message; on_queued then updates exactly its listed tasks. Backoff is 1/1/2/4/7 days, then weekly. Drafts
respect trip-local quiet hours; the core handles final mentions and same-day message dedupe. Digest and
commands never substitute phone numbers for absent display names.

Pending integration decision: reminders exceeding 4000 characters currently fail safely without
advancing nudge state; the overflow summary UX and core subject metadata width are orchestrator-owned.
